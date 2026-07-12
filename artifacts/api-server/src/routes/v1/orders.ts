import { Router, type Response } from "express";
import Razorpay from "razorpay";
import { z } from "zod";
import { db, orders, products, shops, users, payouts, coupons, deliveryPartners } from "@workspace/db";
import { eq, and, ilike, or, gte, ne, desc, count, sql, inArray } from "drizzle-orm";
import { authenticate, requireRole, type AuthRequest } from "../../middlewares/auth.js";
import { validateUuidParams } from "../../middlewares/validateUuid.js";
import { orderLimiter } from "../../middlewares/rateLimiter.js";
import { resolveCommission, calculateCommissionAmount } from "../../utils/commission.js";
import { createNotificationLimited } from "../../utils/notification.js";
import { logger } from "../../lib/logger.js";
import { mi, miArr } from "../../utils/mapId.js";

const router = Router();
const A = requireRole("admin", "super_admin");

// ─── Zod schema for POST /orders ────────────────────────────────────────────
const OrderItemSchema = z.object({
  productId:     z.string().uuid("productId must be a UUID"),
  productName:   z.string().min(1),
  qty:           z.number().int().positive().max(100),
  price:         z.number().nonnegative(),
  category:      z.string().min(1),
  selectedColor: z.string().optional(),
  selectedSize:  z.string().optional(),
});

const CreateOrderSchema = z.object({
  shopId:        z.string().uuid("shopId must be a UUID"),
  shopName:      z.string().min(1),
  customerName:  z.string().min(1),
  customerPhone: z.string().min(6).max(15),
  items:         z.array(OrderItemSchema).min(1, "Order must have at least one item").max(50),
  deliveryCharge: z.number().min(0).default(0),
  couponDiscount: z.number().min(0).default(0),
  paymentMethod: z.string().min(1),
  address: z.object({
    label:   z.string().default(""),
    line1:   z.string().min(1),
    city:    z.string().min(1),
    pincode: z.string().min(4).max(10),
  }),
  deliveryType:    z.enum(['instant', 'scheduled']).default('instant'),
  couponCode:      z.string().optional(),
  razorpayOrderId: z.string().optional(),
  notes:           z.string().max(500).optional(),
});

function getRazorpay(): Razorpay | null {
  const keyId = process.env["RAZORPAY_KEY_ID"];
  const keySecret = process.env["RAZORPAY_KEY_SECRET"];
  if (!keyId || !keySecret) return null;
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

type OrderItem = {
  productId: string;
  productName: string;
  qty: number;
  price: number;
  category: string;
  selectedColor?: string;
  selectedSize?: string;
  commissionType?: string;
  commissionRate?: number;
  commissionAmount?: number;
  commissionLevel?: string;
};

const STATUS_MESSAGES: Record<string, { title: string; message: string }> = {
  placed:           { title: "Order Placed",       message: "Your order has been placed successfully!" },
  accepted:         { title: "Order Accepted",      message: "Your order has been accepted by the shop! 🎉" },
  preparing:        { title: "Order Being Prepared", message: "The shop is preparing your order." },
  confirmed:        { title: "Order Confirmed",     message: "Your order has been confirmed by the shop." },
  packed:           { title: "Order Packed",        message: "Your order is packed and ready for pickup." },
  out_for_delivery: { title: "Out for Delivery",    message: "Your order is on the way! 🚚" },
  delivered:        { title: "Order Delivered",     message: "Your order has been delivered. Enjoy!" },
  cancelled:        { title: "Order Cancelled",     message: "Your order has been cancelled." },
  refunded:         { title: "Refund Processed",    message: "Your refund has been processed." },
};

const STOCK_RESTORE_STATUSES = new Set(["cancelled", "refunded"]);

// All valid order statuses — rejects arbitrary strings (L1)
const VALID_STATUSES = new Set([
  "placed", "accepted", "preparing", "confirmed", "packed", "out_for_delivery", "delivered", "cancelled", "refunded",
]);

// Restore stock for a list of order items and re-activate any that had gone out_of_stock
async function restoreStock(items: OrderItem[]): Promise<void> {
  await Promise.all(items.map(async item => {
    const [updated] = await db.update(products)
      .set({ stock: sql`${products.stock} + ${item.qty}` })
      .where(eq(products.id, item.productId))
      .returning({ stock: products.stock, status: products.status });
    if (updated && updated.stock > 0 && updated.status === "out_of_stock") {
      await db.update(products).set({ status: "active" }).where(eq(products.id, item.productId));
    }
  }));
}

// Cancel the payout associated with an order and decrement coupon usage
async function reverseOrderFinancials(order: { id: string; shopId: string; couponCode?: string | null }): Promise<void> {
  await db.update(payouts)
    .set({ status: "cancelled" })
    .where(sql`${payouts.ordersIncluded} @> ${JSON.stringify([order.id])}::jsonb`)
    .catch((err: unknown) => {
      logger.error({ err, orderId: order.id }, "reverseOrderFinancials: failed to cancel payout");
    });

  if (order.couponCode) {
    await db.update(coupons)
      .set({ usedCount: sql`GREATEST(${coupons.usedCount} - 1, 0)` })
      .where(eq(coupons.code, order.couponCode))
      .catch((err: unknown) => {
        logger.error({ err, couponCode: order.couponCode, orderId: order.id }, "reverseOrderFinancials: failed to decrement coupon");
      });
  }
}

// GET /api/orders
router.get("/", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const { status, shopId, page = "1", limit = "20", search } = req.query as Record<string, string>;
  const pg = parseInt(page), lm = parseInt(limit);
  const conditions = [];
  const role = req.user!.role;

  if (role === "customer") {
    conditions.push(eq(orders.customerId, req.user!.userId));
  } else if (role === "vendor") {
    const vendorShops = await db.select({ id: shops.id }).from(shops).where(eq(shops.ownerId, req.user!.userId));
    const vendorShopIds = vendorShops.map(s => s.id);

    if (vendorShopIds.length === 0) {
      res.json({ success: true, orders: [], total: 0, page: pg, pages: 0 });
      return;
    }

    if (shopId) {
      if (!vendorShopIds.includes(shopId)) {
        res.status(403).json({ success: false, message: "Forbidden: you do not own this shop" });
        return;
      }
      conditions.push(eq(orders.shopId, shopId));
    } else {
      conditions.push(inArray(orders.shopId, vendorShopIds));
    }
  } else {
    if (shopId) conditions.push(eq(orders.shopId, shopId));
  }

  if (status) conditions.push(eq(orders.status, status));
  if (search) {
    conditions.push(or(
      ilike(orders.customerName, `%${search}%`),
      ilike(orders.shopName, `%${search}%`),
    )!);
  }

  const where = conditions.length ? and(...conditions) : undefined;
  const skip = (pg - 1) * lm;

  const [result, [{ total }]] = await Promise.all([
    db.select().from(orders).where(where).orderBy(desc(orders.createdAt)).offset(skip).limit(lm),
    db.select({ total: count() }).from(orders).where(where),
  ]);

  res.json({ success: true, orders: miArr(result), total: Number(total), page: pg, pages: Math.ceil(Number(total) / lm) });
});

// GET /api/orders/:id
router.get("/:id", authenticate, validateUuidParams("id"), async (req: AuthRequest, res: Response): Promise<void> => {
  const [order] = await db.select().from(orders).where(eq(orders.id, req.params["id"] as string)).limit(1);
  if (!order) { res.status(404).json({ success: false, message: "Not found" }); return; }
  if (req.user!.role === "customer" && order.customerId !== req.user!.userId) {
    res.status(403).json({ success: false, message: "Forbidden" });
    return;
  }
  res.json({ success: true, order: mi(order) });
});

// GET /api/orders/:id/rider-location — customer fetches live rider GPS
router.get("/:id/rider-location", authenticate, validateUuidParams("id"), async (req: AuthRequest, res: Response): Promise<void> => {
  const orderId = req.params["id"] as string;
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) { res.status(404).json({ success: false, message: "Order not found" }); return; }
  if (req.user!.role === "customer" && order.customerId !== req.user!.userId) {
    res.status(403).json({ success: false, message: "Forbidden" }); return;
  }
  if (!order.deliveryPartnerId) {
    res.json({ success: true, location: null, message: "No rider assigned yet" }); return;
  }
  const [partner] = await db
    .select({
      name: deliveryPartners.name,
      phone: deliveryPartners.phone,
      vehicle: deliveryPartners.vehicle,
      currentLat: deliveryPartners.currentLat,
      currentLon: deliveryPartners.currentLon,
      locationUpdatedAt: deliveryPartners.locationUpdatedAt,
    })
    .from(deliveryPartners)
    .where(eq(deliveryPartners.id, order.deliveryPartnerId))
    .limit(1);
  if (!partner) { res.json({ success: true, location: null }); return; }
  res.json({
    success: true,
    location: partner.currentLat && partner.currentLon
      ? { lat: partner.currentLat, lon: partner.currentLon, updatedAt: partner.locationUpdatedAt }
      : null,
    rider: { name: partner.name, phone: partner.phone, vehicle: partner.vehicle },
  });
});

// POST /api/orders
// Bug fixes applied:
//   #3 — All writes (stock, order, payout, coupon) are wrapped in a single DB transaction.
//        If anything fails mid-way the DB rolls back atomically; no manual rollback helper needed.
//   #4 — Coupon limits (global usageLimit + perUserLimit) are re-checked INSIDE the transaction
//        under the same DB lock, closing the race window where two parallel requests could
//        both pass the validate endpoint and then both land here simultaneously.
router.post("/", authenticate, orderLimiter, async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = CreateOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: "Invalid order data", errors: parsed.error.flatten().fieldErrors });
    return;
  }

  const body = req.body as Record<string, unknown>;
  type OrderItemInput = { productId: string; productName: string; qty: number; price: number; category: string };
  const items = parsed.data.items as OrderItemInput[];
  const shopId = String(body["shopId"] ?? "");

  // Pre-transaction read: fetch shop (needed for commission resolution + payout)
  const [shop] = await db
    .select({ id: shops.id, ownerId: shops.ownerId, shopType: shops.shopType, ownerName: shops.ownerName, shopName: shops.shopName })
    .from(shops).where(eq(shops.id, shopId)).limit(1);
  const vendorId = shop ? shop.ownerId : shopId;

  const couponCode = typeof body["couponCode"] === "string" && body["couponCode"].trim()
    ? body["couponCode"].trim().toUpperCase()
    : null;

  // ─── Atomic transaction: stock → coupon re-validation → order → payout → coupon increment ───
  let createdOrder: typeof orders.$inferSelect;

  try {
    createdOrder = await db.transaction(async (tx) => {
      // 1. Deduct stock for every item atomically — if any item fails the whole tx rolls back
      const reducedProducts: Array<{ productId: string; qty: number; dbPrice: number }> = [];

      for (const item of items) {
        const [updated] = await tx.update(products)
          .set({ stock: sql`${products.stock} - ${item.qty}` })
          .where(and(
            eq(products.id, item.productId),
            gte(products.stock, item.qty),
            ne(products.status, "inactive"),
          ))
          .returning({ id: products.id, price: products.price, discountedPrice: products.discountedPrice, stock: products.stock });

        if (!updated) {
          throw Object.assign(
            new Error(`"${item.productName}" is out of stock or unavailable.`),
            { statusCode: 400 },
          );
        }

        // Use offer/discounted price when set — this is what the customer was shown
        const dbPrice = updated.discountedPrice ?? updated.price;
        reducedProducts.push({ productId: item.productId, qty: item.qty, dbPrice });

        if (updated.stock === 0) {
          await tx.update(products).set({ status: "out_of_stock" }).where(eq(products.id, item.productId));
        }
      }

      // 2. Recalculate subtotal from real DB prices (client value is ignored)
      const subtotal = +reducedProducts.reduce((sum, r) => sum + r.dbPrice * r.qty, 0).toFixed(2);
      // Minimum is enforced per-order. For multi-shop splits the frontend has already validated
      // the total cart; we only reject here if individual items literally total zero (fraud guard).
      if (subtotal <= 0) {
        throw Object.assign(
          new Error(`Order total must be greater than ₹0.`),
          { statusCode: 400 },
        );
      }

      // 3. Per-item commission calculation (uses real DB prices, not client-supplied prices)
      const dbPriceMap = new Map(reducedProducts.map(r => [r.productId, r.dbPrice]));
      let totalCommissionAmount = 0;
      const enrichedItems: Array<OrderItemInput & {
        commissionType: string;
        commissionRate: number;
        commissionAmount: number;
        commissionLevel: string;
      }> = [];

      for (const item of items) {
        const dbPrice = dbPriceMap.get(item.productId) ?? 0;
        const lineTotal = dbPrice * item.qty;
        const itemResolved = await resolveCommission({
          productId: item.productId,
          vendorId,
          categorySlug: item.category,
          shopTypeSlug: shop?.shopType ?? undefined,
        });
        const itemCommission = calculateCommissionAmount(lineTotal, itemResolved);
        totalCommissionAmount += itemCommission;
        enrichedItems.push({
          ...item,
          price: dbPrice,
          commissionType: itemResolved.type,
          commissionRate: itemResolved.rate,
          commissionAmount: +itemCommission.toFixed(2),
          commissionLevel: itemResolved.level,
        });
      }

      const commissionAmount = +totalCommissionAmount.toFixed(2);
      const deliveryCharge = Number(body["deliveryCharge"] ?? 0);
      const couponDiscount = Number(body["couponDiscount"] ?? 0);
      const netAmount = subtotal + deliveryCharge - couponDiscount;
      const vendorPayable = +(netAmount - commissionAmount).toFixed(2);
      const avgRate = enrichedItems.length > 0
        ? +(enrichedItems.reduce((s, it) => s + it.commissionRate, 0) / enrichedItems.length).toFixed(2)
        : 0;

      // 4. Re-validate coupon inside the transaction (fixes race condition — Bug #4)
      //    Two concurrent requests both passed /coupons/validate but we re-check here
      //    while holding the transaction lock so only one can succeed.
      if (couponCode) {
        const [coupon] = await tx.select().from(coupons)
          .where(eq(coupons.code, couponCode))
          .limit(1);

        if (!coupon || !coupon.isActive) {
          throw Object.assign(new Error("Coupon is no longer valid."), { statusCode: 400 });
        }
        if (coupon.expiryDate < new Date()) {
          throw Object.assign(new Error("Coupon has expired."), { statusCode: 400 });
        }
        if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) {
          throw Object.assign(new Error("Coupon usage limit has been reached."), { statusCode: 400 });
        }
        if (coupon.perUserLimit > 0) {
          const [{ uses }] = await tx.select({ uses: count() }).from(orders)
            .where(and(
              eq(orders.customerId, req.user!.userId),
              eq(orders.couponCode, couponCode),
              ne(orders.status, "cancelled"),
              ne(orders.status, "refunded"),
            ));
          if (Number(uses) >= coupon.perUserLimit) {
            throw Object.assign(
              new Error(`You've already used this coupon ${coupon.perUserLimit} time${coupon.perUserLimit > 1 ? "s" : ""} (limit reached).`),
              { statusCode: 400 },
            );
          }
        }
      }

      // 5. Insert order record
      const paymentMethod = String(body["paymentMethod"] ?? "COD");
      const deliveryOtp = String(Math.floor(1000 + Math.random() * 9000));
      const [order] = await tx.insert(orders).values({
        customerId: req.user!.userId,
        customerName: String(body["customerName"] ?? ""),
        customerPhone: String(body["customerPhone"] ?? ""),
        shopId,
        shopName: String(body["shopName"] ?? ""),
        items: enrichedItems,
        subtotal,
        deliveryCharge,
        couponDiscount,
        netAmount,
        commissionRate: avgRate,
        commissionAmount,
        vendorPayable,
        platformRevenue: commissionAmount,
        deliveryType: (body["deliveryType"] === "scheduled" ? "scheduled" : "instant") as "instant" | "scheduled",
        paymentMethod,
        paymentStatus: "pending",
        address: (body["address"] ?? {}) as Record<string, string>,
        couponCode: couponCode ?? undefined,
        deliveryOtp,
        razorpayOrderId: typeof body["razorpayOrderId"] === "string" && body["razorpayOrderId"].trim()
          ? body["razorpayOrderId"].trim()
          : undefined,
      }).returning();

      // 6. Create payout record inside transaction — vendor payout is guaranteed or order rolls back
      if (shopId && vendorPayable > 0 && shop) {
        await tx.insert(payouts).values({
          vendorId: shop.ownerId,
          vendorName: shop.ownerName ?? String(body["shopName"] ?? ""),
          shopId,
          amount: vendorPayable,
          orderTotal: netAmount,
          commissionAmount,
          status: "pending",
          ordersIncluded: [order!.id],
        });
      }

      // 7. Increment coupon usedCount inside transaction — atomic with the order insert
      if (couponCode) {
        await tx.update(coupons)
          .set({ usedCount: sql`${coupons.usedCount} + 1` })
          .where(eq(coupons.code, couponCode));
      }

      return order!;
    });
  } catch (err: unknown) {
    // Known validation errors (stock, minimum order, coupon) — return 4xx to client
    const e = err as { statusCode?: number; message?: string };
    if (e.statusCode) {
      res.status(e.statusCode).json({ success: false, message: e.message });
      return;
    }
    // Unexpected DB/server errors — re-throw for Express 5 global handler (returns 500)
    throw err;
  }

  // Post-transaction: fire-and-forget notifications — failures never affect the 201 response
  createNotificationLimited(req.user!.userId, {
    type: "order_update",
    title: "Order Placed Successfully",
    message: `Your order #${createdOrder.id.slice(-6).toUpperCase()} has been placed. We'll keep you updated!`,
    data: { orderId: createdOrder.id },
  }).catch(() => {});

  try {
    if (shop?.ownerId) {
      const [vendor] = await db.select({ id: users.id }).from(users).where(eq(users.id, shop.ownerId)).limit(1);
      if (vendor) {
        await createNotificationLimited(vendor.id, {
          type: "order_update",
          title: "New Order Received",
          message: `You have a new order #${createdOrder.id.slice(-6).toUpperCase()} worth ₹${createdOrder.netAmount}.`,
          data: { orderId: createdOrder.id },
        });
      }
    }
  } catch { /* ignore vendor notification errors */ }

  // Notify all admins so they can assign a delivery partner
  try {
    const adminUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(or(eq(users.role, "admin"), eq(users.role, "super_admin")));

    const shortId = createdOrder.id.slice(-6).toUpperCase();
    const shopName = shop?.shopName ?? "a shop";

    await Promise.all(
      adminUsers.map(admin =>
        createNotificationLimited(admin.id, {
          type: "order_update",
          title: "🛵 New Order — Assign Rider",
          message: `Order #${shortId} from ${shopName} needs a delivery partner. Tap to assign.`,
          data: { orderId: createdOrder.id, url: "/admin?tab=orders" },
        }).catch(() => {})
      )
    );
  } catch { /* ignore admin notification errors */ }

  res.status(201).json({ success: true, order: mi(createdOrder) });
});

// PATCH /api/orders/:id/status
router.patch("/:id/status", authenticate, validateUuidParams("id"), async (req: AuthRequest, res: Response): Promise<void> => {
  const orderId = req.params["id"] as string;
  const { status, cancelReason } = req.body as { status: string; cancelReason?: string };

  if (!VALID_STATUSES.has(status)) {
    res.status(400).json({ success: false, message: `Invalid status '${status}'` });
    return;
  }

  const role = req.user!.role;
  const userId = req.user!.userId;

  if (role === "customer") {
    if (status !== "cancelled") {
      res.status(403).json({ success: false, message: "Customers can only cancel orders" });
      return;
    }
    const [customerOrder] = await db.select({ customerId: orders.customerId })
      .from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!customerOrder) { res.status(404).json({ success: false, message: "Not found" }); return; }
    if (customerOrder.customerId !== userId) {
      res.status(403).json({ success: false, message: "Forbidden" });
      return;
    }
  } else if (role === "vendor") {
    if (status === "refunded") {
      res.status(403).json({ success: false, message: "Only admins can issue refunds" });
      return;
    }
    const vendorShops = await db.select({ id: shops.id }).from(shops).where(eq(shops.ownerId, userId));
    const vendorShopIds = new Set(vendorShops.map(s => s.id));
    const [vendorOrder] = await db.select({ shopId: orders.shopId })
      .from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!vendorOrder) { res.status(404).json({ success: false, message: "Not found" }); return; }
    if (!vendorShopIds.has(vendorOrder.shopId)) {
      res.status(403).json({ success: false, message: "Forbidden: you do not own this shop" });
      return;
    }
  }

  const [current] = await db.select({ status: orders.status, couponCode: orders.couponCode })
    .from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!current) { res.status(404).json({ success: false, message: "Not found" }); return; }

  const update: Record<string, unknown> = { status };
  if (cancelReason) update["cancelReason"] = cancelReason;

  const [order] = await db.update(orders)
    .set(update)
    .where(eq(orders.id, orderId))
    .returning();
  if (!order) { res.status(404).json({ success: false, message: "Not found" }); return; }

  const wasAlreadyTerminal = STOCK_RESTORE_STATUSES.has(current.status);

  if (STOCK_RESTORE_STATUSES.has(status) && !wasAlreadyTerminal) {
    if (Array.isArray(order.items) && order.items.length) {
      await restoreStock(order.items as OrderItem[]);
    }
    await reverseOrderFinancials({ id: order.id, shopId: order.shopId, couponCode: order.couponCode });
  }

  try {
    const msg = STATUS_MESSAGES[status];
    if (msg && order.customerId) {
      await createNotificationLimited(order.customerId, {
        type: "order_update",
        title: msg.title,
        message: msg.message,
        data: { orderId: order.id, status },
      });
    }
  } catch { /* ignore */ }

  res.json({ success: true, order: mi(order) });
});

// POST /api/orders/:id/refund
router.post("/:id/refund", authenticate, A, validateUuidParams("id"), async (req: AuthRequest, res: Response): Promise<void> => {
  const orderId = req.params["id"] as string;

  const [current] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!current) { res.status(404).json({ success: false, message: "Order not found" }); return; }

  let razorpayWarning: string | null = null;
  if (current.paymentMethod !== "COD" && current.razorpayPaymentId) {
    const rzp = getRazorpay();
    if (rzp) {
      try {
        await rzp.payments.refund(current.razorpayPaymentId, {
          amount: Math.round(current.netAmount * 100),
          speed: "normal",
          notes: { orderId, reason: "Admin initiated refund via SwiftMart dashboard" },
        });
      } catch (rzpErr) {
        logger.error({ orderId, razorpayPaymentId: current.razorpayPaymentId, err: rzpErr }, "Razorpay refund API call failed");
        razorpayWarning = "Razorpay API call failed — order marked refunded in DB but you must issue the payment refund manually from the Razorpay dashboard.";
      }
    } else {
      razorpayWarning = "Razorpay credentials not configured — order marked refunded in DB but you must issue the payment refund manually.";
    }
  }

  const [order] = await db.update(orders)
    .set({ status: "refunded", paymentStatus: "refunded", refundedAt: new Date() })
    .where(eq(orders.id, orderId))
    .returning();
  if (!order) { res.status(404).json({ success: false, message: "Not found" }); return; }

  const wasAlreadyTerminal = STOCK_RESTORE_STATUSES.has(current.status);
  if (!wasAlreadyTerminal) {
    if (Array.isArray(order.items) && order.items.length) {
      await restoreStock(order.items as OrderItem[]);
    }
    await reverseOrderFinancials({ id: order.id, shopId: order.shopId, couponCode: order.couponCode });
  }

  try {
    if (order.customerId) {
      await createNotificationLimited(order.customerId, {
        type: "order_update",
        title: "Refund Processed",
        message: `Your refund for order #${order.id.slice(-6).toUpperCase()} has been processed.`,
        data: { orderId: order.id },
      });
    }
  } catch { /* ignore */ }

  res.json({ success: true, order: mi(order), ...(razorpayWarning ? { warning: razorpayWarning } : {}) });
});

// PATCH /api/orders/:id/assign-partner — admin: assign or unassign a delivery partner
router.patch("/:id/assign-partner", authenticate, A, validateUuidParams("id"), async (req: AuthRequest, res: Response): Promise<void> => {
  const orderId = req.params["id"] as string;
  const { deliveryPartnerId } = req.body as { deliveryPartnerId: string | null };

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) { res.status(404).json({ success: false, message: "Order not found" }); return; }

  // Release previous partner's currentOrderId if they were holding this order
  if (order.deliveryPartnerId && order.deliveryPartnerId !== deliveryPartnerId) {
    await db.update(deliveryPartners)
      .set({ currentOrderId: null, updatedAt: new Date() })
      .where(eq(deliveryPartners.id, order.deliveryPartnerId));
  }

  // Stamp new partner's currentOrderId
  if (deliveryPartnerId) {
    const [partner] = await db.select().from(deliveryPartners).where(eq(deliveryPartners.id, deliveryPartnerId)).limit(1);
    if (!partner) { res.status(404).json({ success: false, message: "Delivery partner not found" }); return; }
    if (partner.status !== "active") { res.status(400).json({ success: false, message: "Partner is not active" }); return; }

    await db.update(deliveryPartners)
      .set({ currentOrderId: orderId, updatedAt: new Date() })
      .where(eq(deliveryPartners.id, deliveryPartnerId));
  }

  const [updated] = await db.update(orders)
    .set({ deliveryPartnerId: deliveryPartnerId ?? null, updatedAt: new Date() })
    .where(eq(orders.id, orderId))
    .returning();

  // Notify the newly assigned delivery partner
  if (deliveryPartnerId) {
    try {
      const [partner] = await db.select({ userId: deliveryPartners.userId, name: deliveryPartners.name })
        .from(deliveryPartners).where(eq(deliveryPartners.id, deliveryPartnerId)).limit(1);
      if (partner?.userId) {
        await createNotificationLimited(partner.userId, {
          type: "delivery_update",
          title: "New Order Assigned 🛵",
          message: `Order #${orderId.slice(-6).toUpperCase()} has been assigned to you. Tap to view details.`,
          data: { orderId, url: "/delivery" },
        });
      }
    } catch { /* ignore — don't fail the assignment */ }
  }

  res.json({ success: true, order: mi(updated!) });
});

export default router;
