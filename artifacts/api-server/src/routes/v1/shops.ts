import { Router, type Request, type Response } from "express";
import { db, shops, shopTypes, users, products, orders } from "@workspace/db";
import { eq, and, ilike, or, inArray, desc, count, sql } from "drizzle-orm";
import { deleteImage } from "../../lib/imageStorage.js";
import { authenticate, requireRole, optionalAuth, type AuthRequest } from "../../middlewares/auth.js";
import { createNotificationLimited } from "../../utils/notification.js";
import { mi, miArr } from "../../utils/mapId.js";

const router = Router();
const A = requireRole("admin", "super_admin");
const ADMIN_ROLES = new Set(["admin", "super_admin"]);

const SENSITIVE_FIELDS = ["panNumber", "gstNumber", "bankAccountHolderName", "bankAccountNumber", "bankIfscCode", "upiId"] as const;

function stripSensitiveFields(shop: Record<string, unknown>): Record<string, unknown> {
  const safe = { ...shop };
  for (const field of SENSITIVE_FIELDS) delete safe[field];
  return safe;
}

// GET /api/shops
router.get("/", optionalAuth, async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  const isAdmin = authReq.user?.role === "admin" || authReq.user?.role === "super_admin";

  const { status, shopType, city, ownerId, pincode, page = "1", limit = "20", search, category } =
    req.query as Record<string, string>;

  const pg = Math.max(1, parseInt(page) || 1);
  const lm = Math.min(200, Math.max(1, parseInt(limit) || 20));
  const conditions = [];

  // Sanitize JSONB query inputs — pincode must be numeric-only, city capped at 100 chars
  const safeCity    = typeof city    === "string" ? city.trim().replace(/[%_\\]/g, "").slice(0, 100) : "";
  const safePincode = typeof pincode === "string" ? pincode.replace(/\D/g, "").slice(0, 6)           : "";

  if (status) conditions.push(eq(shops.status, status));
  if (category) conditions.push(ilike(shops.category, `%${category}%`));
  if (safeCity)    conditions.push(sql`${shops.address}->>'city' ILIKE ${"%" + safeCity + "%"}`);
  if (ownerId) conditions.push(eq(shops.ownerId, ownerId));
  if (safePincode) conditions.push(sql`${shops.address}->>'pincode' = ${safePincode}`);
  if (search) {
    conditions.push(or(
      ilike(shops.shopName, `%${search}%`),
      ilike(shops.ownerName, `%${search}%`),
      ilike(shops.phone, `%${search}%`),
    )!);
  }

  // Non-admin browsing without an explicit status filter must only see approved shops.
  // Vendors viewing their own shop (ownerId filter) are exempt so they can see pending/rejected too.
  if (!isAdmin && !status && !ownerId) {
    conditions.push(eq(shops.status, "approved"));
  }

  if (shopType) {
    conditions.push(eq(shops.shopType, shopType));
  }

  const where = conditions.length ? and(...conditions) : undefined;
  const skip = (pg - 1) * lm;

  const [result, [{ total }]] = await Promise.all([
    db.select().from(shops).where(where).orderBy(desc(shops.createdAt)).offset(skip).limit(lm),
    db.select({ total: count() }).from(shops).where(where),
  ]);

  const mapped = miArr(result);
  const sanitised = isAdmin ? mapped : mapped.map(s => stripSensitiveFields(s as Record<string, unknown>));
  res.json({ success: true, shops: sanitised, total: Number(total), page: pg, pages: Math.ceil(Number(total) / lm) });
});

// GET /api/shops/:id/details — admin: shop + products + recent orders + owner
router.get("/:id/details", authenticate, A, async (req: AuthRequest, res: Response): Promise<void> => {
  const [shop] = await db.select().from(shops).where(eq(shops.id, req.params["id"] as string)).limit(1);
  if (!shop) { res.status(404).json({ success: false, message: "Shop not found" }); return; }

  const [shopProducts, shopOrders, ownerArr] = await Promise.all([
    db.select().from(products).where(eq(products.shopId, shop.id)),
    db.select().from(orders).where(eq(orders.shopId, shop.id)).orderBy(desc(orders.createdAt)).limit(50),
    db.select({
      id: users.id, name: users.name, phone: users.phone, email: users.email,
      role: users.role, vendorStatus: users.vendorStatus, status: users.status, createdAt: users.createdAt,
    }).from(users).where(eq(users.id, shop.ownerId)).limit(1),
  ]);

  const revenue = shopOrders.reduce((sum, o) => sum + (o.netAmount ?? o.subtotal ?? 0), 0);
  const owner = ownerArr[0] ? { ...ownerArr[0], _id: ownerArr[0].id } : null;

  res.json({ success: true, shop: mi(shop), products: miArr(shopProducts), orders: miArr(shopOrders), owner, totalProducts: shopProducts.length, totalOrders: shopOrders.length, revenue });
});

// GET /api/shops/:id
router.get("/:id", optionalAuth, async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  const isAdmin = authReq.user?.role === "admin" || authReq.user?.role === "super_admin";
  const [shop] = await db.select().from(shops).where(eq(shops.id, req.params["id"] as string)).limit(1);
  if (!shop) { res.status(404).json({ success: false, message: "Shop not found" }); return; }
  const mapped = mi(shop) as Record<string, unknown>;
  res.json({ success: true, shop: isAdmin ? mapped : stripSensitiveFields(mapped) });
});

// POST /api/shops/admin-create
router.post("/admin-create", authenticate, A, async (req: AuthRequest, res: Response): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const phone = String(body["phone"] ?? "").trim();
  if (!phone) { res.status(400).json({ success: false, message: "Owner phone is required" }); return; }
  if (!body["shopName"]) { res.status(400).json({ success: false, message: "Shop name is required" }); return; }

  // Wrap user upsert + shop insert in one transaction so a crash mid-way
  // can't leave an owner with no shop (or a shop with no owner).
  const { shop, owner } = await db.transaction(async (tx) => {
    let [owner] = await tx.select().from(users).where(eq(users.phone, phone)).limit(1);
    if (!owner) {
      [owner] = await tx.insert(users).values({
        name: String(body["ownerName"] ?? body["shopName"] ?? "Vendor"),
        phone,
        email: body["ownerEmail"] ? String(body["ownerEmail"]) : undefined,
        role: "vendor",
        vendorStatus: "approved",
        status: "active",
      }).returning();
    } else {
      const updates: Record<string, string> = { vendorStatus: "approved" };
      if (!ADMIN_ROLES.has(owner.role)) updates["role"] = "vendor";
      [owner] = await tx.update(users).set(updates).where(eq(users.id, owner.id)).returning();
    }

    const [shop] = await tx.insert(shops).values({
      shopName: String(body["shopName"]),
      ownerName: String(body["ownerName"] ?? owner.name),
      phone,
      ownerId: owner.id,
      address: (body["address"] ?? {}) as Record<string, string>,
      shopType: body["shopType"] ? String(body["shopType"]) : (body["category"] ? String(body["category"]) : undefined),
      category: body["category"] ? String(body["category"]) : undefined,
      description: body["description"] ? String(body["description"]) : undefined,
      image: body["image"] ? String(body["image"]) : undefined,
      status: "approved",
      isOpen: true,
      panNumber: String(body["panNumber"] ?? "ADMIN000000A"),
      bankAccountNumber: String(body["bankAccountNumber"] ?? "0000000000"),
      bankIfscCode: String(body["bankIfscCode"] ?? "ADMIN0000000"),
      upiId: String(body["upiId"] ?? `${phone}@upi`),
    }).returning();

    return { shop: shop!, owner };
  });

  // Notification is a non-critical side effect — runs outside the transaction
  void createNotificationLimited(owner.id, {
    type: "system",
    title: "Vendor Account Created",
    message: "Your shop has been created and approved by SwiftMart Admin.",
  });

  res.status(201).json({ success: true, shop: mi(shop), owner: mi(owner) });
});

// POST /api/shops — vendor applies
router.post("/", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const { z } = await import("zod");
  const schema = z.object({
    shopName:             z.string().trim().min(2, "Shop name must be at least 2 characters").max(100),
    ownerName:            z.string().trim().min(2, "Owner name required").max(100),
    phone:                z.string().regex(/^[6-9]\d{9}$/, "Valid 10-digit mobile number required"),
    address:              z.object({
      line1:   z.string().min(1).max(200).optional(),
      city:    z.string().min(1).max(100).optional(),
      pincode: z.string().regex(/^\d{6}$/).optional(),
    }).optional(),
    shopType:             z.string().max(50).optional(),
    category:             z.string().max(50).optional(),
    subcategory:          z.string().max(50).optional(),
    description:          z.string().max(1000).optional(),
    image:                z.string().url().optional(),
    banner:               z.string().url().optional(),
    panNumber:            z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, "Invalid PAN number format"),
    gstNumber:            z.string().max(20).optional(),
    bankAccountHolderName:z.string().max(100).optional(),
    bankAccountNumber:    z.string().min(9, "Bank account number required").max(20),
    bankIfscCode:         z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Invalid IFSC code format"),
    upiId:                z.string().max(100).optional(),
    certificateType:      z.string().max(50).optional(),
    certificateNumber:    z.string().max(100).optional(),
    certificateExpiryDate:z.string().optional(),
    certificateFile:      z.string().url().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    const message = parsed.error.errors[0]?.message ?? "Invalid input";
    res.status(400).json({ success: false, message });
    return;
  }

  const d = parsed.data;

  // Shop insert + user status update must be atomic — a partial write
  // would leave the user's role and the shop record out of sync.
  try {
    const shop = await db.transaction(async (tx) => {
      const [shop] = await tx.insert(shops).values({
        shopName: d.shopName,
        ownerName: d.ownerName,
        phone: d.phone,
        ownerId: req.user!.userId,
        address: (d.address ?? {}) as Record<string, string>,
        shopType: d.shopType,
        category: d.category,
        subcategory: d.subcategory,
        description: d.description,
        image: d.image,
        banner: d.banner,
        panNumber: d.panNumber,
        gstNumber: d.gstNumber,
        bankAccountHolderName: d.bankAccountHolderName,
        bankAccountNumber: d.bankAccountNumber,
        bankIfscCode: d.bankIfscCode,
        upiId: d.upiId,
        certificateType: d.certificateType,
        certificateNumber: d.certificateNumber,
        certificateExpiryDate: d.certificateExpiryDate,
        certificateFile: d.certificateFile,
        certificateStatus: d.certificateFile ? "pending" : undefined,
        verificationStatus: "pending",
        status: "pending",
      }).returning();
      await tx.update(users).set({ vendorStatus: "pending" }).where(eq(users.id, req.user!.userId));
      return shop!;
    });

    res.status(201).json({ success: true, shop: mi(shop) });
  } catch (err) {
    req.log?.error?.({ err }, "Shop registration failed");
    res.status(500).json({ success: false, message: "Shop registration failed. Please try again." });
  }
});

// PATCH /api/shops/my/certificate — vendor re-uploads rejected certificate
router.patch("/my/certificate", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  if (!body["certificateFile"]) {
    res.status(400).json({ success: false, message: "certificateFile is required" });
    return;
  }
  const update: Record<string, unknown> = {
    certificateFile: String(body["certificateFile"]),
    certificateStatus: "pending",
    certificateRejectReason: null,
  };
  if (body["certificateNumber"]) update["certificateNumber"] = String(body["certificateNumber"]);
  if (body["certificateExpiryDate"]) update["certificateExpiryDate"] = String(body["certificateExpiryDate"]);
  const [updated] = await db.update(shops).set(update).where(eq(shops.ownerId, req.user!.userId)).returning();
  if (!updated) { res.status(404).json({ success: false, message: "Shop not found" }); return; }
  res.json({ success: true, shop: mi(updated) });
});

// POST /api/shops/:id/verify — admin verifies vendor compliance
router.post("/:id/verify", authenticate, A, async (req: AuthRequest, res: Response): Promise<void> => {
  const [shop] = await db.update(shops)
    .set({ verificationStatus: "verified", certificateStatus: "verified" })
    .where(eq(shops.id, req.params["id"] as string))
    .returning();
  if (!shop) { res.status(404).json({ success: false, message: "Shop not found" }); return; }
  void createNotificationLimited(shop.ownerId, {
    type: "system",
    title: "Vendor Verified",
    message: "Your shop compliance has been verified. You can now access all vendor features.",
  });
  res.json({ success: true, shop: mi(shop) });
});

// POST /api/shops/:id/reject-certificate — admin rejects the certificate
router.post("/:id/reject-certificate", authenticate, A, async (req: AuthRequest, res: Response): Promise<void> => {
  const { reason } = req.body as { reason?: string };
  const [shop] = await db.update(shops)
    .set({
      certificateStatus: "rejected",
      certificateRejectReason: reason ?? null,
      verificationStatus: "pending",
    })
    .where(eq(shops.id, req.params["id"] as string))
    .returning();
  if (!shop) { res.status(404).json({ success: false, message: "Shop not found" }); return; }
  void createNotificationLimited(shop.ownerId, {
    type: "system",
    title: "Compliance Document Rejected",
    message: reason
      ? `Your compliance document was rejected: ${reason}. Please re-upload.`
      : "Your compliance document was rejected. Please re-upload a valid document.",
  });
  res.json({ success: true, shop: mi(shop) });
});

// PATCH /api/shops/my/profile — vendor updates their own shop profile (safe fields only)
router.patch("/my/profile", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const allowed = ["shopName", "description", "image", "banner", "address", "shopType", "category", "timings"] as const;
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) update[key] = body[key];
  }
  // M2: fetch old image/banner before update so we can clean up replaced Cloudinary assets
  const [oldShop] = await db.select({ image: shops.image, banner: shops.banner })
    .from(shops).where(eq(shops.ownerId, req.user!.userId)).limit(1);

  const [updated] = await db.update(shops).set(update).where(eq(shops.ownerId, req.user!.userId)).returning();
  if (!updated) { res.status(404).json({ success: false, message: "Shop not found" }); return; }

  // Delete old Cloudinary assets that were replaced
  if (oldShop) {
    const toDelete: string[] = [];
    if ("image" in update && update["image"] !== oldShop.image && oldShop.image) toDelete.push(oldShop.image);
    if ("banner" in update && update["banner"] !== oldShop.banner && oldShop.banner) toDelete.push(oldShop.banner);
    if (toDelete.length > 0) void Promise.all(toDelete.map(url => deleteImage(url)));
  }

  res.json({ success: true, shop: mi(updated) });
});

// PATCH /api/shops/my/toggle-open — vendor toggles their own shop open/close
router.patch("/my/toggle-open", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const [shop] = await db.select().from(shops).where(eq(shops.ownerId, req.user!.userId)).limit(1);
  if (!shop) { res.status(404).json({ success: false, message: "Shop not found" }); return; }
  if (shop.status !== "approved") {
    res.status(403).json({ success: false, message: "Only approved shops can change their open status" });
    return;
  }
  const [updated] = await db.update(shops).set({ isOpen: !shop.isOpen }).where(eq(shops.id, shop.id)).returning();
  res.json({ success: true, isOpen: updated!.isOpen, shop: mi(updated!) });
});

// PATCH /api/shops/:id — admin updates shop fields (allowlist-validated to prevent arbitrary injection)
const SHOP_PATCH_ALLOWED = new Set([
  "shopName", "ownerName", "phone", "address", "shopType", "category", "subcategory",
  "description", "image", "banner", "timings", "commissionRate", "status", "isOpen",
  "panNumber", "gstNumber", "bankAccountHolderName", "bankAccountNumber", "bankIfscCode", "upiId",
]);
router.patch("/:id", authenticate, A, async (req: AuthRequest, res: Response): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (SHOP_PATCH_ALLOWED.has(k)) update[k] = v;
  }
  if (Object.keys(update).length === 0) {
    res.status(400).json({ success: false, message: "No valid fields provided. Allowed: " + [...SHOP_PATCH_ALLOWED].join(", ") });
    return;
  }
  // M2: fetch old image/banner before update so we can clean up replaced Cloudinary assets
  const [oldShop] = await db.select({ image: shops.image, banner: shops.banner })
    .from(shops).where(eq(shops.id, req.params["id"] as string)).limit(1);

  const [shop] = await db.update(shops).set(update).where(eq(shops.id, req.params["id"] as string)).returning();
  if (!shop) { res.status(404).json({ success: false, message: "Shop not found" }); return; }

  if (oldShop) {
    const toDelete: string[] = [];
    if ("image" in update && update["image"] !== oldShop.image && oldShop.image) toDelete.push(oldShop.image);
    if ("banner" in update && update["banner"] !== oldShop.banner && oldShop.banner) toDelete.push(oldShop.banner);
    if (toDelete.length > 0) void Promise.all(toDelete.map(url => deleteImage(url)));
  }

  res.json({ success: true, shop: mi(shop) });
});

// POST /api/shops/:id/approve
router.post("/:id/approve", authenticate, A, async (req: AuthRequest, res: Response): Promise<void> => {
  const shopId = req.params["id"] as string;

  const [existing] = await db.select({
    certificateFile: shops.certificateFile,
    certificateStatus: shops.certificateStatus,
  }).from(shops).where(eq(shops.id, shopId)).limit(1);

  if (!existing) { res.status(404).json({ success: false, message: "Shop not found" }); return; }

  // If a compliance document was uploaded but not yet explicitly verified,
  // auto-verify it on approval — the admin's approval action IS the verification.
  const certUpdate: Record<string, unknown> = {};
  if (existing.certificateFile && existing.certificateStatus === "pending") {
    certUpdate["certificateStatus"] = "verified";
  }

  const shop = await db.transaction(async (tx) => {
    const [shop] = await tx.update(shops)
      .set({ status: "approved", isOpen: true, ...certUpdate })
      .where(eq(shops.id, shopId)).returning();
    if (!shop) return null;
    const [owner] = await tx.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, shop.ownerId)).limit(1);
    if (owner) {
      const updates: Record<string, string> = { vendorStatus: "approved" };
      if (!ADMIN_ROLES.has(owner.role)) updates["role"] = "vendor";
      await tx.update(users).set(updates).where(eq(users.id, owner.id));
    }
    return shop;
  });
  if (!shop) { res.status(404).json({ success: false, message: "Shop not found" }); return; }
  res.json({ success: true, shop: mi(shop) });
});

// POST /api/shops/:id/reject
router.post("/:id/reject", authenticate, A, async (req: AuthRequest, res: Response): Promise<void> => {
  const { reason } = req.body as { reason?: string };
  const shop = await db.transaction(async (tx) => {
    const [shop] = await tx.update(shops)
      .set({ status: "rejected", rejectionReason: reason ?? null })
      .where(eq(shops.id, req.params["id"] as string))
      .returning();
    if (!shop) return null;
    await tx.update(users).set({ vendorStatus: "rejected" }).where(eq(users.id, shop.ownerId));
    return shop;
  });
  if (!shop) { res.status(404).json({ success: false, message: "Shop not found" }); return; }
  res.json({ success: true, shop: mi(shop) });
});

// POST /api/shops/:id/ban
router.post("/:id/ban", authenticate, A, async (req: AuthRequest, res: Response): Promise<void> => {
  const shop = await db.transaction(async (tx) => {
    const [shop] = await tx.update(shops).set({ status: "banned", isOpen: false }).where(eq(shops.id, req.params["id"] as string)).returning();
    if (!shop) return null;
    const [owner] = await tx.select({ role: users.role }).from(users).where(eq(users.id, shop.ownerId)).limit(1);
    const updates: Record<string, string> = { vendorStatus: "rejected" };
    if (owner && !ADMIN_ROLES.has(owner.role)) updates["role"] = "customer";
    await tx.update(users).set(updates).where(eq(users.id, shop.ownerId));
    return shop;
  });
  if (!shop) { res.status(404).json({ success: false, message: "Shop not found" }); return; }
  void createNotificationLimited(shop.ownerId, {
    type: "system",
    title: "Vendor Access Removed",
    message: "Your vendor access is no longer active. Please contact admin or register again.",
  });
  res.json({ success: true, shop: mi(shop) });
});

// POST /api/shops/:id/unban
router.post("/:id/unban", authenticate, A, async (req: AuthRequest, res: Response): Promise<void> => {
  const shop = await db.transaction(async (tx) => {
    const [shop] = await tx.update(shops).set({ status: "approved", isOpen: true }).where(eq(shops.id, req.params["id"] as string)).returning();
    if (!shop) return null;
    const [owner] = await tx.select({ role: users.role }).from(users).where(eq(users.id, shop.ownerId)).limit(1);
    const updates: Record<string, string> = { vendorStatus: "approved" };
    if (owner && !ADMIN_ROLES.has(owner.role)) updates["role"] = "vendor";
    await tx.update(users).set(updates).where(eq(users.id, shop.ownerId));
    return shop;
  });
  if (!shop) { res.status(404).json({ success: false, message: "Shop not found" }); return; }
  res.json({ success: true, shop: mi(shop) });
});

// PATCH /api/shops/:id/toggle-open — admin opens or closes any shop
router.patch("/:id/toggle-open", authenticate, A, async (req: AuthRequest, res: Response): Promise<void> => {
  const [shop] = await db.select().from(shops).where(eq(shops.id, req.params["id"] as string)).limit(1);
  if (!shop) { res.status(404).json({ success: false, message: "Shop not found" }); return; }
  if (shop.status !== "approved") {
    res.status(400).json({ success: false, message: "Only approved shops can change open status" });
    return;
  }
  const [updated] = await db.update(shops).set({ isOpen: !shop.isOpen }).where(eq(shops.id, shop.id)).returning();
  res.json({ success: true, isOpen: updated!.isOpen, shop: mi(updated!) });
});

// PATCH /api/shops/:id/owner — admin assigns/changes the owner of a shop
router.patch("/:id/owner", authenticate, A, async (req: AuthRequest, res: Response): Promise<void> => {
  const { phone, ownerName } = req.body as { phone: string; ownerName?: string };
  if (!phone) { res.status(400).json({ success: false, message: "Phone is required" }); return; }

  const [existingShop] = await db.select().from(shops).where(eq(shops.id, req.params["id"] as string)).limit(1);
  if (!existingShop) { res.status(404).json({ success: false, message: "Shop not found" }); return; }

  // User upsert + shop owner reassignment must be atomic
  const { newOwner, updatedShop } = await db.transaction(async (tx) => {
    let [newOwner] = await tx.select().from(users).where(eq(users.phone, phone)).limit(1);
    if (!newOwner) {
      [newOwner] = await tx.insert(users).values({
        name: ownerName ?? "Vendor",
        phone,
        role: "vendor",
        vendorStatus: "approved",
        status: "active",
      }).returning();
    } else {
      const updates: Record<string, string> = { vendorStatus: "approved" };
      if (!ADMIN_ROLES.has(newOwner.role)) updates["role"] = "vendor";
      [newOwner] = await tx.update(users).set(updates).where(eq(users.id, newOwner.id)).returning();
    }

    const [updatedShop] = await tx.update(shops).set({
      ownerId: newOwner.id,
      phone,
      ownerName: ownerName ?? newOwner.name,
    }).where(eq(shops.id, req.params["id"] as string)).returning();

    return { newOwner, updatedShop: updatedShop! };
  });

  res.json({ success: true, shop: mi(updatedShop), owner: mi(newOwner) });
});

// PATCH /api/shops/:id/link-owner — admin fixes a vendor account that has the wrong credentials
// (e.g. Google-login user got a separate customer account instead of the vendor account)
// Strategy:
//   1. If a user already exists with the given email → promote that user to vendor and point the shop at them.
//   2. Otherwise → update the current owner's phone + email and promote them.
router.patch("/:id/link-owner", authenticate, A, async (req: AuthRequest, res: Response): Promise<void> => {
  const { phone, email } = req.body as { phone?: string; email?: string };
  if (!phone && !email) {
    res.status(400).json({ success: false, message: "At least one of phone or email is required" });
    return;
  }

  const [shop] = await db.select().from(shops).where(eq(shops.id, req.params["id"] as string)).limit(1);
  if (!shop) { res.status(404).json({ success: false, message: "Shop not found" }); return; }

  const result = await db.transaction(async (tx) => {
    let targetUser: typeof users.$inferSelect | undefined;

    if (email) {
      const [byEmail] = await tx.select().from(users).where(eq(users.email, email)).limit(1);
      if (byEmail) targetUser = byEmail;
    }

    if (!targetUser && phone) {
      const [byPhone] = await tx.select().from(users).where(eq(users.phone, phone)).limit(1);
      if (byPhone) targetUser = byPhone;
    }

    if (!targetUser) {
      const [currentOwner] = await tx.select().from(users).where(eq(users.id, shop.ownerId)).limit(1);
      targetUser = currentOwner;
    }

    if (!targetUser) return null;

    const updates: Record<string, unknown> = { vendorStatus: "approved" };
    if (!ADMIN_ROLES.has(targetUser.role)) updates["role"] = "vendor";
    if (phone && phone !== targetUser.phone) updates["phone"] = phone;
    if (email && email !== targetUser.email) updates["email"] = email;

    const [updatedUser] = await tx.update(users).set(updates).where(eq(users.id, targetUser.id)).returning();

    const shopUpdates: Record<string, unknown> = { ownerId: targetUser.id };
    if (phone) shopUpdates["phone"] = phone;
    const [updatedShop] = await tx.update(shops).set(shopUpdates).where(eq(shops.id, shop.id)).returning();

    return { user: updatedUser, shop: updatedShop };
  });

  if (!result) { res.status(404).json({ success: false, message: "Owner not found" }); return; }
  res.json({ success: true, user: mi(result.user!), shop: mi(result.shop!) });
});

// DELETE /api/shops/:id
router.delete("/:id", authenticate, A, async (req: AuthRequest, res: Response): Promise<void> => {
  const [shop] = await db.select().from(shops).where(eq(shops.id, req.params["id"] as string)).limit(1);
  if (!shop) { res.json({ success: true, message: "Shop deleted" }); return; }

  // Fetch images for Cloudinary cleanup before the transaction
  const shopProducts = await db.select({ images: products.images }).from(products).where(eq(products.shopId, shop.id));
  const allImages = shopProducts.flatMap(p => (p.images as string[]) ?? []);

  // Wrap all DB mutations atomically — products delete + user reset + shop delete
  // Cloudinary cleanup is external and runs outside (can't be rolled back anyway)
  await db.transaction(async (tx) => {
    const [owner] = await tx.select({ role: users.role }).from(users).where(eq(users.id, shop.ownerId)).limit(1);
    const roleUpdate: Record<string, string> = owner && ADMIN_ROLES.has(owner.role)
      ? { vendorStatus: "none" }
      : { vendorStatus: "none", role: "customer" };

    await Promise.all([
      tx.delete(products).where(eq(products.shopId, shop.id)),
      tx.update(users).set(roleUpdate).where(eq(users.id, shop.ownerId)),
    ]);
    await tx.delete(shops).where(eq(shops.id, shop.id));
  });

  // Side effects outside the transaction — best-effort, non-blocking
  void Promise.all(allImages.map(url => deleteImage(url)));
  void createNotificationLimited(shop.ownerId, {
    type: "system",
    title: "Shop Removed",
    message: "Your shop has been removed by admin. Please register again to continue selling.",
  });

  res.json({ success: true, message: "Shop deleted" });
});

export default router;
