import { Router, type Request, type Response } from "express";
import { db, products, shops, categories, users } from "@workspace/db";
import { eq, and, ilike, inArray, desc, count, gt, sql, or } from "drizzle-orm";
import { authenticate, requireRole, optionalAuth, type AuthRequest } from "../../middlewares/auth.js";
import { vendorWriteLimiter } from "../../middlewares/rateLimiter.js";
import { deleteImage } from "../../lib/imageStorage.js";
import { createNotificationLimited } from "../../utils/notification.js";
import { mi, miArr } from "../../utils/mapId.js";

const router = Router();
const A = requireRole("admin", "super_admin");
const V = requireRole("vendor", "admin", "super_admin");

// M6 fix: validate that each image value is a well-formed URL (prevents XSS / broken images)
function sanitizeImages(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((u): u is string => {
    if (typeof u !== "string") return false;
    try { new URL(u); return true; } catch { return false; }
  });
}

// GET /api/products
router.get("/", optionalAuth, async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  const isPrivileged = authReq.user?.role === "admin" || authReq.user?.role === "super_admin" || authReq.user?.role === "vendor";

  const { shopId, category, search, trending, page = "1", limit = "20", pincode } =
    req.query as Record<string, string>;

  // status=all is restricted to authenticated vendor/admin users — prevent customer bypass of active/stock filters
  const rawStatus = (req.query as Record<string, string>)["status"];
  const status = rawStatus === "all" && !isPrivileged ? "active" : (rawStatus ?? "active");

  const pg = parseInt(page), lm = parseInt(limit);
  const conditions = [];

  // status=all skips the status filter entirely (used by admin/vendor product management)
  if (status !== "all") {
    conditions.push(eq(products.status, status));
    // For customer-facing active product listings, also exclude zero-stock products
    if (status === "active") {
      conditions.push(gt(products.stock, 0));
    }
  }

  if (category) conditions.push(eq(products.category, category));
  if (search) conditions.push(ilike(products.name, `%${search}%`));
  if (trending === "true") conditions.push(eq(products.trending, true));

  // For customer-facing active queries, restrict by category only when a specific
  // category is requested — do NOT filter the general listing by active-category slugs
  // because vendor products may use shop-type slugs that don't map 1:1 to customer categories.
  if (status === "active" && category) {
    const activeCats = await db.select({ slug: categories.slug }).from(categories).where(eq(categories.isActive, true));
    const activeSlugs = activeCats.map(c => c.slug);
    if (activeSlugs.length > 0 && !activeSlugs.includes(category)) {
      res.json({ success: true, products: [], total: 0, page: 1, pages: 0 });
      return;
    }
  }

  // Shop scope
  if (pincode) {
    const pincodeShops = await db.select({ id: shops.id })
      .from(shops)
      .where(and(
        sql`${shops.address}->>'pincode' = ${pincode}`,
        eq(shops.status, "approved"),
      ));
    if (pincodeShops.length === 0) {
      res.json({ success: true, products: [], total: 0, page: pg, pages: 0 });
      return;
    }
    conditions.push(inArray(products.shopId, pincodeShops.map(s => s.id)));
  } else if (shopId) {
    if (status === "all") {
      // Vendor/admin viewing their own shop's products — no approval check needed
      conditions.push(eq(products.shopId, shopId));
    } else {
      // Customer-facing: only return products from approved shops
      const [shop] = await db.select({ status: shops.status }).from(shops).where(eq(shops.id, shopId)).limit(1);
      if (!shop || shop.status !== "approved") {
        res.json({ success: true, products: [], total: 0, page: pg, pages: 0 });
        return;
      }
      conditions.push(eq(products.shopId, shopId));
    }
  } else {
    // No shopId, no pincode — restrict to products from approved shops.
    // Use a subquery so we never load the full approved-shops list into Node memory.
    conditions.push(
      inArray(
        products.shopId,
        db.select({ id: shops.id }).from(shops).where(eq(shops.status, "approved"))
      )
    );
  }

  const where = conditions.length ? and(...conditions) : undefined;
  const skip = (pg - 1) * lm;

  const [result, [{ total }]] = await Promise.all([
    db.select().from(products).where(where).orderBy(desc(products.createdAt)).offset(skip).limit(lm),
    db.select({ total: count() }).from(products).where(where),
  ]);

  // Batch-fetch shop names so every product card can display the seller
  const shopIds = [...new Set(result.map(p => p.shopId))];
  const shopRows = shopIds.length > 0
    ? await db.select({ id: shops.id, shopName: shops.shopName }).from(shops).where(inArray(shops.id, shopIds))
    : [];
  const shopMap = Object.fromEntries(shopRows.map(s => [s.id, s.shopName]));
  const enriched = result.map(p => ({ ...mi(p), shopName: shopMap[p.shopId] ?? "" }));

  res.json({ success: true, products: enriched, total: Number(total), page: pg, pages: Math.ceil(Number(total) / lm) });
});

// GET /api/products/admin-review — admin: list products for approval with shop name
// IMPORTANT: must be defined before /:id to avoid route conflict
router.get("/admin-review", authenticate, A, async (req: AuthRequest, res: Response): Promise<void> => {
  const { status = "pending", page = "1", limit = "50" } = req.query as Record<string, string>;
  const pg = parseInt(page), lm = parseInt(limit);
  const where = status !== "all" ? eq(products.status, status) : undefined;
  const skip = (pg - 1) * lm;

  const [result, [{ total }]] = await Promise.all([
    db.select().from(products).where(where).orderBy(desc(products.createdAt)).offset(skip).limit(lm),
    db.select({ total: count() }).from(products).where(where),
  ]);

  // Batch-fetch shop names
  const shopIds = [...new Set(result.map(p => p.shopId))];
  const shopRows = shopIds.length > 0
    ? await db.select({ id: shops.id, shopName: shops.shopName }).from(shops).where(inArray(shops.id, shopIds))
    : [];
  const shopMap = Object.fromEntries(shopRows.map(s => [s.id, s.shopName]));

  const enriched = result.map(p => ({ ...mi(p), shopName: shopMap[p.shopId] ?? "Unknown Shop" }));
  res.json({ success: true, products: enriched, total: Number(total), page: pg, pages: Math.ceil(Number(total) / lm) });
});

// GET /api/products/trending-manager — admin: all products enriched with sales stats for trending management
// IMPORTANT: defined before /:id to avoid route conflict
router.get("/trending-manager", authenticate, A, async (req: AuthRequest, res: Response): Promise<void> => {
  const { status } = req.query as Record<string, string>;

  const where = status && status !== "all" ? eq(products.status, status) : undefined;
  const allProducts = await db.select().from(products).where(where).orderBy(desc(products.createdAt)).limit(2000);

  // Sales stats by productId from orders JSONB
  const salesRows = await db.execute(sql`
    SELECT
      item->>'productId' AS product_id,
      SUM((item->>'qty')::int)::int AS units_sold,
      SUM((item->>'qty')::int * (item->>'price')::float)::float AS revenue
    FROM orders, jsonb_array_elements(items::jsonb) AS item
    WHERE item->>'productId' IS NOT NULL
    GROUP BY item->>'productId'
  `);
  const salesMap = new Map(
    (salesRows.rows as { product_id: string; units_sold: number; revenue: number }[])
      .map(r => [r.product_id, { unitsSold: Number(r.units_sold), revenue: Number(r.revenue) }])
  );

  const shopIds = [...new Set(allProducts.map(p => p.shopId))];
  const shopRows = shopIds.length > 0
    ? await db.select({ id: shops.id, shopName: shops.shopName }).from(shops).where(inArray(shops.id, shopIds))
    : [];
  const shopMap = Object.fromEntries(shopRows.map(s => [s.id, s.shopName]));

  const enriched = allProducts.map(p => ({
    ...mi(p),
    shopName: shopMap[p.shopId] ?? "Unknown Shop",
    unitsSold: salesMap.get(p.id)?.unitsSold ?? 0,
    revenue: salesMap.get(p.id)?.revenue ?? 0,
  }));

  res.json({ success: true, products: enriched });
});

// GET /api/products/:id
// L4 fix: strip admin-only fields (rejectionReason, commissionRate) for public/non-admin callers
router.get("/:id", optionalAuth, async (req: Request, res: Response): Promise<void> => {
  const authReq = req as AuthRequest;
  const isAdmin = authReq.user?.role === "admin" || authReq.user?.role === "super_admin";
  const [product] = await db.select().from(products).where(eq(products.id, req.params["id"] as string)).limit(1);
  if (!product) { res.status(404).json({ success: false, message: "Not found" }); return; }
  const mapped = mi(product) as Record<string, unknown>;
  if (!isAdmin) {
    delete mapped["rejectionReason"];
    delete mapped["commissionRate"];
  }
  res.json({ success: true, product: mapped });
});

// POST /api/products
router.post("/", authenticate, vendorWriteLimiter, async (req: AuthRequest, res: Response): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const VENDOR_ROLES = new Set(["vendor", "admin", "super_admin"]);

  // Self-heal: if the user's JWT says "customer" but they own an approved shop,
  // their role was never updated (e.g. Google-login account linking gap). Fix it now.
  if (!VENDOR_ROLES.has(req.user!.role)) {
    const [ownedShop] = await db.select({ id: shops.id })
      .from(shops)
      .where(and(eq(shops.ownerId, req.user!.userId), eq(shops.status, "approved")))
      .limit(1);
    if (ownedShop) {
      await db.update(users).set({ role: "vendor", vendorStatus: "approved" }).where(eq(users.id, req.user!.userId));
      req.user!.role = "vendor";
    } else {
      res.status(403).json({ success: false, message: "Forbidden: insufficient role" });
      return;
    }
  }

  const isAdmin = req.user!.role === "admin" || req.user!.role === "super_admin";

  // Admin can create a product for any shop by passing shopId directly (may specify status)
  if (isAdmin && body["shopId"]) {
    const [shopExists] = await db.select({ id: shops.id }).from(shops).where(eq(shops.id, String(body["shopId"]))).limit(1);
    if (!shopExists) { res.status(400).json({ success: false, message: "Shop not found" }); return; }
    const adminPrice = Math.max(0, Number(body["price"] ?? 0) || 0);
    const adminDiscounted = body["discountedPrice"] != null ? (Number(body["discountedPrice"]) || undefined) : undefined;
    if (adminDiscounted != null && adminDiscounted >= adminPrice) {
      res.status(400).json({ success: false, message: "Sale price must be less than MRP" });
      return;
    }
    const [product] = await db.insert(products).values({
      name: String(body["name"] ?? ""),
      description: body["description"] ? String(body["description"]) : undefined,
      price: adminPrice,
      discountedPrice: adminDiscounted,
      category: String(body["category"] ?? ""),
      subcategory: body["subcategory"] ? String(body["subcategory"]) : undefined,
      shopId: String(body["shopId"]),
      images: sanitizeImages(body["images"]),
      stock: Math.max(0, Number(body["stock"] ?? 0) || 0),
      sku: body["sku"] ? String(body["sku"]) : undefined,
      unit: body["unit"] ? String(body["unit"]) : undefined,
      commissionRate: body["commissionRate"] != null ? (Number(body["commissionRate"]) || undefined) : undefined,
      trending: Boolean(body["trending"] ?? false),
      status: body["status"] ? String(body["status"]) : "pending",
      colors: Array.isArray(body["colors"]) ? body["colors"] : undefined,
      sizes: Array.isArray(body["sizes"]) ? body["sizes"] : undefined,
      colorImages: (body["colorImages"] && typeof body["colorImages"] === "object" && !Array.isArray(body["colorImages"])) ? body["colorImages"] : undefined,
    }).returning();
    res.status(201).json({ success: true, product: mi(product!) });
    return;
  }

  const [shop] = await db.select({ id: shops.id }).from(shops).where(eq(shops.ownerId, req.user!.userId)).limit(1);
  if (!shop) { res.status(400).json({ success: false, message: "No approved shop found for this vendor" }); return; }

  // Vendor uploads always start as pending — strip any status the client may have sent
  const { status: _ignored, ...safeBody } = body;
  const vendorPrice = Math.max(0, Number(safeBody["price"] ?? 0) || 0);
  const vendorDiscounted = safeBody["discountedPrice"] != null ? (Number(safeBody["discountedPrice"]) || undefined) : undefined;
  if (vendorDiscounted != null && vendorDiscounted >= vendorPrice) {
    res.status(400).json({ success: false, message: "Sale price must be less than MRP" });
    return;
  }
  const [product] = await db.insert(products).values({
    name: String(safeBody["name"] ?? ""),
    description: safeBody["description"] ? String(safeBody["description"]) : undefined,
    price: vendorPrice,
    discountedPrice: vendorDiscounted,
    category: String(safeBody["category"] ?? ""),
    subcategory: safeBody["subcategory"] ? String(safeBody["subcategory"]) : undefined,
    shopId: shop.id,
    images: sanitizeImages(safeBody["images"]),
    stock: Math.max(0, Number(safeBody["stock"] ?? 0) || 0),
    sku: safeBody["sku"] ? String(safeBody["sku"]) : undefined,
    unit: safeBody["unit"] ? String(safeBody["unit"]) : undefined,
    commissionRate: safeBody["commissionRate"] != null ? (Number(safeBody["commissionRate"]) || undefined) : undefined,
    trending: Boolean(safeBody["trending"] ?? false),
    status: "pending",
    colors: Array.isArray(safeBody["colors"]) ? safeBody["colors"] : undefined,
    sizes: Array.isArray(safeBody["sizes"]) ? safeBody["sizes"] : undefined,
    colorImages: (safeBody["colorImages"] && typeof safeBody["colorImages"] === "object" && !Array.isArray(safeBody["colorImages"])) ? safeBody["colorImages"] : undefined,
  }).returning();

  // Notify all admins & super_admins that a new product is pending review
  try {
    const adminUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(or(eq(users.role, "admin"), eq(users.role, "super_admin")));
    await Promise.all(
      adminUsers.map(admin =>
        createNotificationLimited(admin.id, {
          type: "system",
          title: "🛒 New Product Pending Review",
          message: `A vendor submitted "${product!.name}" for approval. Review it in the admin panel.`,
          data: { productId: product!.id },
        })
      )
    );
  } catch {
    // Non-fatal — product was created; notification failure should not block response
  }

  res.status(201).json({ success: true, product: mi(product!) });
});

// PATCH /api/products/:id/approval — admin: approve or reject a product with notification
router.patch("/:id/approval", authenticate, A, async (req: AuthRequest, res: Response): Promise<void> => {
  const { action, rejectionReason } = req.body as { action: "approve" | "reject"; rejectionReason?: string };

  if (action !== "approve" && action !== "reject") {
    res.status(400).json({ success: false, message: "action must be 'approve' or 'reject'" });
    return;
  }
  if (action === "reject" && !rejectionReason?.trim()) {
    res.status(400).json({ success: false, message: "rejectionReason is required when rejecting" });
    return;
  }

  const updatePayload = action === "approve"
    ? { status: "active", rejectionReason: null as string | null }
    : { status: "rejected", rejectionReason: rejectionReason!.trim() };

  const [product] = await db.update(products).set(updatePayload).where(eq(products.id, req.params["id"] as string)).returning();
  if (!product) { res.status(404).json({ success: false, message: "Product not found" }); return; }

  // Notify the vendor who owns this product
  try {
    const [shop] = await db.select({ ownerId: shops.ownerId }).from(shops).where(eq(shops.id, product.shopId)).limit(1);
    if (shop?.ownerId) {
      if (action === "approve") {
        await createNotificationLimited(shop.ownerId, {
          type: "system",
          title: "✅ Product Approved",
          message: `Your product "${product.name}" has been approved by SwiftMart and is now visible to customers.`,
          data: { productId: product.id },
        });
      } else {
        await createNotificationLimited(shop.ownerId, {
          type: "system",
          title: "❌ Product Rejected",
          message: `Your product "${product.name}" has been rejected.\n\nReason:\n${rejectionReason}`,
          data: { productId: product.id, rejectionReason },
        });
      }
    }
  } catch {
    // Non-fatal — product status was updated; notification failure should not block response
  }

  res.json({ success: true, product: mi(product) });
});

// PATCH /api/products/:id — vendor/admin edit
// Vendor edits always reset status to "pending" and verify ownership (M2)
router.patch("/:id", authenticate, V, vendorWriteLimiter, async (req: AuthRequest, res: Response): Promise<void> => {
  const isAdmin = req.user!.role === "admin" || req.user!.role === "super_admin";
  const body = req.body as Record<string, unknown>;

  // Fetch existing product upfront for ownership check + old image cleanup (M2)
  const [existing] = await db.select({ shopId: products.shopId, images: products.images })
    .from(products).where(eq(products.id, req.params["id"] as string)).limit(1);
  if (!existing) { res.status(404).json({ success: false, message: "Not found" }); return; }

  if (!isAdmin) {
    const [shop] = await db.select({ id: shops.id }).from(shops)
      .where(eq(shops.ownerId, req.user!.userId)).limit(1);
    if (!shop || shop.id !== existing.shopId) {
      res.status(403).json({ success: false, message: "Forbidden" });
      return;
    }
  }

  const updateData: Record<string, unknown> = { ...body };
  if (!isAdmin) {
    // Vendor edits must go through re-approval — force status back to pending
    updateData["status"] = "pending";
    delete updateData["rejectionReason"];
  }
  // Validate: sale price must be less than MRP when both are present
  if ("discountedPrice" in updateData && updateData["discountedPrice"] != null) {
    const updatedMrp = "price" in updateData
      ? Number(updateData["price"])
      : (await db.select({ price: products.price }).from(products).where(eq(products.id, req.params["id"] as string)).limit(1))[0]?.price ?? 0;
    const updatedSale = Number(updateData["discountedPrice"]);
    if (updatedSale >= updatedMrp) {
      res.status(400).json({ success: false, message: "Sale price must be less than MRP" });
      return;
    }
  }
  // M6 fix: sanitize image URLs on update too
  if ("images" in updateData) {
    updateData["images"] = sanitizeImages(updateData["images"]);
  }

  const [product] = await db.update(products)
    .set(updateData)
    .where(eq(products.id, req.params["id"] as string))
    .returning();
  if (!product) { res.status(404).json({ success: false, message: "Not found" }); return; }

  // M2: delete Cloudinary images that were removed from the images array
  if ("images" in updateData) {
    const oldImages = (existing.images as string[]) ?? [];
    const newImages = (updateData["images"] as string[]) ?? [];
    const removed = oldImages.filter(url => !newImages.includes(url));
    if (removed.length > 0) {
      void Promise.all(removed.map(url => deleteImage(url)));
    }
  }

  res.json({ success: true, product: mi(product) });
});

// DELETE /api/products/:id
router.delete("/:id", authenticate, A, async (req: AuthRequest, res: Response): Promise<void> => {
  const [product] = await db.select({ images: products.images }).from(products).where(eq(products.id, req.params["id"] as string)).limit(1);
  if (product?.images && (product.images as string[]).length > 0) {
    await Promise.all((product.images as string[]).map(url => deleteImage(url)));
  }
  await db.delete(products).where(eq(products.id, req.params["id"] as string));
  res.json({ success: true, message: "Deleted" });
});

export default router;
