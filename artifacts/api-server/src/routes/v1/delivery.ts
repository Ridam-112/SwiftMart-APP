import { Router, type Response } from "express";
import { db, deliveryPartners, deliveryChargeRules, deliverySettings, orders, users, shops } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { authenticate, requireRole, type AuthRequest } from "../../middlewares/auth.js";
import { validateUuidParams } from "../../middlewares/validateUuid.js";
import { mi, miArr } from "../../utils/mapId.js";
import { createNotificationLimited } from "../../utils/notification.js";

const router = Router();
const A = requireRole("admin", "super_admin");

// ─── Delivery Partners ────────────────────────────────────────────────────────

router.get("/", authenticate, A, async (_req, res: Response): Promise<void> => {
  const partners = await db.select().from(deliveryPartners).orderBy(desc(deliveryPartners.createdAt));
  res.json({ success: true, partners: miArr(partners) });
});

router.post("/", authenticate, A, async (req: AuthRequest, res: Response): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const phone = String(body["phone"] ?? "");

  // Auto-resolve userId from phone if not explicitly supplied
  let resolvedUserId: string | undefined = body["userId"] ? String(body["userId"]) : undefined;
  if (!resolvedUserId && phone) {
    const [linked] = await db.select({ id: users.id }).from(users).where(eq(users.phone, phone)).limit(1);
    if (linked) resolvedUserId = linked.id;
  }

  const [partner] = await db.insert(deliveryPartners).values({
    name: String(body["name"] ?? ""),
    phone,
    userId: resolvedUserId,
    vehicle: body["vehicle"] ? String(body["vehicle"]) : undefined,
    isAvailable: body["isAvailable"] != null ? Boolean(body["isAvailable"]) : true,
    status: body["status"] ? String(body["status"]) : "active",
  }).returning();
  res.status(201).json({ success: true, partner: mi(partner!) });
});

router.patch("/:id", authenticate, A, async (req: AuthRequest, res: Response): Promise<void> => {
  const id = req.params["id"] as string;
  if (!id.match(/^[0-9a-f-]{36}$/i)) {
    // not a UUID — skip to next handler
    return;
  }
  const [partner] = await db.update(deliveryPartners)
    .set(req.body as Record<string, unknown>)
    .where(eq(deliveryPartners.id, id))
    .returning();
  if (!partner) { res.status(404).json({ success: false, message: "Not found" }); return; }
  res.json({ success: true, partner: mi(partner) });
});

router.delete("/:id", authenticate, A, async (req: AuthRequest, res: Response): Promise<void> => {
  const id = req.params["id"] as string;
  if (!id.match(/^[0-9a-f-]{36}$/i)) {
    return;
  }
  await db.delete(deliveryPartners).where(eq(deliveryPartners.id, id));
  res.json({ success: true, message: "Deleted" });
});

// POST /delivery/:id/link-user — admin: auto-link a partner to the user account with matching phone
router.post("/:id/link-user", authenticate, A, validateUuidParams("id"), async (req: AuthRequest, res: Response): Promise<void> => {
  const id = req.params["id"] as string;
  const [p] = await db.select().from(deliveryPartners).where(eq(deliveryPartners.id, id)).limit(1);
  if (!p) { res.status(404).json({ success: false, message: "Partner not found" }); return; }

  const [userRow] = await db.select({ id: users.id }).from(users).where(eq(users.phone, p.phone)).limit(1);
  if (!userRow) {
    res.status(404).json({ success: false, message: `No user account found with phone ${p.phone}. Ask the partner to sign up first.` });
    return;
  }

  const [updated] = await db.update(deliveryPartners)
    .set({ userId: userRow.id, updatedAt: new Date() })
    .where(eq(deliveryPartners.id, id))
    .returning();
  res.json({ success: true, partner: mi(updated!), message: "User account linked successfully" });
});

// ─── Delivery Charge Rules ────────────────────────────────────────────────────

// GET /delivery/charges — public: returns all rules + rain mode status
router.get("/charges", async (_req, res: Response): Promise<void> => {
  const [rules, settingRow] = await Promise.all([
    db.select().from(deliveryChargeRules).orderBy(desc(deliveryChargeRules.createdAt)),
    db.select().from(deliverySettings).where(eq(deliverySettings.key, "rain_mode_active")),
  ]);
  const rainModeActive = settingRow[0]?.value === "true";
  res.json({ success: true, rules: miArr(rules), rainModeActive });
});

// GET /delivery/charges/calculate — public: compute fee for a pincode pair
router.get("/charges/calculate", async (req, res: Response): Promise<void> => {
  const shopPincode = String(req.query["shopPincode"] ?? "");
  const userPincode = String(req.query["userPincode"] ?? "");

  if (shopPincode === userPincode) {
    res.json({ success: true, crossAreaCharge: 0, rainSurcharge: 0, rainModeActive: false, total: 0 });
    return;
  }

  const [ruleRows, settingRow] = await Promise.all([
    db.select().from(deliveryChargeRules).where(
      and(
        eq(deliveryChargeRules.fromPincode, shopPincode),
        eq(deliveryChargeRules.toPincode, userPincode),
      )
    ).limit(1),
    db.select().from(deliverySettings).where(eq(deliverySettings.key, "rain_mode_active")),
  ]);

  const rule = ruleRows[0];
  const rainModeActive = settingRow[0]?.value === "true";
  const crossAreaCharge = rule?.baseCharge ?? 0;
  const rainSurcharge = rainModeActive ? (rule?.rainSurcharge ?? 0) : 0;

  res.json({
    success: true,
    crossAreaCharge,
    rainSurcharge,
    rainModeActive,
    total: crossAreaCharge + rainSurcharge,
  });
});

// POST /delivery/charges — admin: add rule
router.post("/charges", authenticate, A, async (req: AuthRequest, res: Response): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const [rule] = await db.insert(deliveryChargeRules).values({
    fromPincode: String(body["fromPincode"] ?? ""),
    toPincode: String(body["toPincode"] ?? ""),
    baseCharge: Number(body["baseCharge"] ?? 0),
    rainSurcharge: Number(body["rainSurcharge"] ?? 0),
    label: body["label"] ? String(body["label"]) : null,
  }).returning();
  res.status(201).json({ success: true, rule: mi(rule!) });
});

// PATCH /delivery/charges/:id — admin: update rule
router.patch("/charges/:id", authenticate, A, async (req: AuthRequest, res: Response): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const [rule] = await db.update(deliveryChargeRules).set({
    fromPincode: body["fromPincode"] ? String(body["fromPincode"]) : undefined,
    toPincode: body["toPincode"] ? String(body["toPincode"]) : undefined,
    baseCharge: body["baseCharge"] != null ? Number(body["baseCharge"]) : undefined,
    rainSurcharge: body["rainSurcharge"] != null ? Number(body["rainSurcharge"]) : undefined,
    label: body["label"] != null ? String(body["label"]) : undefined,
    updatedAt: new Date(),
  }).where(eq(deliveryChargeRules.id, req.params["id"] as string)).returning();
  if (!rule) { res.status(404).json({ success: false, message: "Rule not found" }); return; }
  res.json({ success: true, rule: mi(rule) });
});

// DELETE /delivery/charges/:id — admin: delete rule
router.delete("/charges/:id", authenticate, A, async (req: AuthRequest, res: Response): Promise<void> => {
  await db.delete(deliveryChargeRules).where(eq(deliveryChargeRules.id, req.params["id"] as string));
  res.json({ success: true, message: "Rule deleted" });
});

// ─── Rain Mode ────────────────────────────────────────────────────────────────

// POST /delivery/rain-mode — admin: toggle or set rain mode
router.post("/rain-mode", authenticate, A, async (req: AuthRequest, res: Response): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const active = Boolean(body["active"]);

  // upsert the setting
  const existing = await db.select().from(deliverySettings).where(eq(deliverySettings.key, "rain_mode_active"));
  if (existing.length > 0) {
    await db.update(deliverySettings)
      .set({ value: active ? "true" : "false", updatedAt: new Date() })
      .where(eq(deliverySettings.key, "rain_mode_active"));
  } else {
    await db.insert(deliverySettings).values({
      key: "rain_mode_active",
      value: active ? "true" : "false",
    });
  }

  res.json({ success: true, rainModeActive: active });
});

// ─── Fleet Map (admin only) ───────────────────────────────────────────────────

// GET /delivery/fleet — all partners + current lat/lon + active order info
router.get("/fleet", authenticate, A, async (_req, res: Response): Promise<void> => {
  const partners = await db
    .select({
      id: deliveryPartners.id,
      name: deliveryPartners.name,
      phone: deliveryPartners.phone,
      vehicle: deliveryPartners.vehicle,
      status: deliveryPartners.status,
      isAvailable: deliveryPartners.isAvailable,
      currentLat: deliveryPartners.currentLat,
      currentLon: deliveryPartners.currentLon,
      locationUpdatedAt: deliveryPartners.locationUpdatedAt,
    })
    .from(deliveryPartners)
    .orderBy(desc(deliveryPartners.locationUpdatedAt));

  // Fetch active orders per partner (status not delivered/cancelled)
  const activeOrders = await db
    .select({
      id: orders.id,
      deliveryPartnerId: orders.deliveryPartnerId,
      status: orders.status,
      netAmount: orders.netAmount,
      address: orders.address,
    })
    .from(orders)
    .where(eq(orders.status, "out_for_delivery"));

  const orderByPartner = new Map<string, typeof activeOrders[number]>();
  for (const o of activeOrders) {
    if (o.deliveryPartnerId) orderByPartner.set(o.deliveryPartnerId, o);
  }

  const fleet = partners.map(p => ({
    ...mi(p),
    activeOrder: p.id ? (orderByPartner.get(p.id) ?? null) : null,
  }));

  res.json({ success: true, fleet });
});

// ─── Delivery Partner Self-Service ───────────────────────────────────────────

// GET /delivery/me — get own partner profile
// First tries by userId; falls back to phone match and auto-links if found.
router.get("/me", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;

  // Primary: exact userId match
  let [partner] = await db.select().from(deliveryPartners).where(eq(deliveryPartners.userId, userId)).limit(1);

  if (!partner) {
    // Fallback: look up this user's phone, then find partner by phone
    const [userRow] = await db.select({ phone: users.phone }).from(users).where(eq(users.id, userId)).limit(1);
    if (userRow?.phone) {
      [partner] = await db.select().from(deliveryPartners).where(eq(deliveryPartners.phone, userRow.phone)).limit(1);
      // Auto-link: stamp userId so future lookups skip the fallback
      if (partner && !partner.userId) {
        await db.update(deliveryPartners).set({ userId, updatedAt: new Date() }).where(eq(deliveryPartners.id, partner.id));
        partner = { ...partner, userId };
      }
    }
  }

  if (!partner) { res.status(404).json({ success: false, message: "Not a delivery partner" }); return; }
  res.json({ success: true, partner: mi(partner) });
});

// PATCH /delivery/me/location — rider pushes GPS coords (called every ~10s while active)
router.patch("/me/location", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const { lat, lon } = req.body as { lat: number; lon: number };
  if (typeof lat !== "number" || typeof lon !== "number") {
    res.status(400).json({ success: false, message: "lat and lon required" }); return;
  }
  const [partner] = await db.select().from(deliveryPartners).where(eq(deliveryPartners.userId, userId)).limit(1);
  if (!partner) { res.status(404).json({ success: false, message: "Not a delivery partner" }); return; }
  await db.update(deliveryPartners)
    .set({ currentLat: lat, currentLon: lon, locationUpdatedAt: new Date(), updatedAt: new Date() })
    .where(eq(deliveryPartners.id, partner.id));
  res.json({ success: true });
});

// PATCH /delivery/me/availability — toggle online/offline
router.patch("/me/availability", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const [existing] = await db.select().from(deliveryPartners).where(eq(deliveryPartners.userId, userId)).limit(1);
  if (!existing) { res.status(404).json({ success: false, message: "Not a delivery partner" }); return; }
  if (existing.status !== "active") { res.status(403).json({ success: false, message: "Account is not active" }); return; }
  const [partner] = await db.update(deliveryPartners)
    .set({ isAvailable: !existing.isAvailable, updatedAt: new Date() })
    .where(eq(deliveryPartners.userId, userId))
    .returning();
  res.json({ success: true, partner: mi(partner!) });
});

// GET /delivery/me/orders — get all orders assigned to this partner
router.get("/me/orders", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const [partner] = await db.select().from(deliveryPartners).where(eq(deliveryPartners.userId, userId)).limit(1);
  if (!partner) { res.status(404).json({ success: false, message: "Not a delivery partner" }); return; }

  const rows = await db
    .select({ order: orders, shopAddress: shops.address })
    .from(orders)
    .leftJoin(shops, eq(orders.shopId, shops.id))
    .where(eq(orders.deliveryPartnerId, partner.id))
    .orderBy(desc(orders.createdAt));

  const result = rows.map(({ order, shopAddress }) => ({
    ...mi(order),
    shopAddress: (shopAddress ?? {}) as Record<string, string>,
  }));

  res.json({ success: true, orders: result, partner: mi(partner) });
});

// PATCH /delivery/me/orders/:orderId/status — mark order as out_for_delivery or delivered
// Body: { status: "out_for_delivery" | "delivered", confirmCash?: boolean }
// For COD orders, pass confirmCash: true when rider has collected payment — sets paymentStatus="paid".
router.patch("/me/orders/:orderId/status", authenticate, validateUuidParams("orderId"), async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const orderId = req.params["orderId"] as string;
  const { status, confirmCash } = req.body as { status: string; confirmCash?: boolean };

  const [partner] = await db.select().from(deliveryPartners).where(eq(deliveryPartners.userId, userId)).limit(1);
  if (!partner) { res.status(403).json({ success: false, message: "Not a delivery partner" }); return; }

  const allowed = ["out_for_delivery"];
  if (!allowed.includes(status)) {
    res.status(400).json({
      success: false,
      message: status === "delivered"
        ? "To mark an order as delivered, enter the customer's delivery OTP."
        : "Delivery partners can only set out_for_delivery via this endpoint.",
    });
    return;
  }

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) { res.status(404).json({ success: false, message: "Order not found" }); return; }
  if (order.deliveryPartnerId !== partner.id) {
    res.status(403).json({ success: false, message: "This order is not assigned to you" });
    return;
  }

  const isCod = (order.paymentMethod ?? "COD").toUpperCase() === "COD";

  if (status === "delivered") {
    await db.update(deliveryPartners).set({
      ordersDelivered: partner.ordersDelivered + 1,
      totalEarnings: partner.totalEarnings + (order.deliveryCharge ?? 0),
      currentOrderId: null,
      updatedAt: new Date(),
    }).where(eq(deliveryPartners.id, partner.id));
  } else if (status === "out_for_delivery") {
    await db.update(deliveryPartners).set({
      currentOrderId: order.id,
      updatedAt: new Date(),
    }).where(eq(deliveryPartners.id, partner.id));
  }

  // For COD orders marked delivered with cash confirmed, mark payment as paid
  const paymentStatusUpdate = (status === "delivered" && isCod && confirmCash) ? { paymentStatus: "paid" } : {};

  const [updated] = await db.update(orders)
    .set({ status, ...paymentStatusUpdate, updatedAt: new Date() })
    .where(eq(orders.id, orderId))
    .returning();

  // Notify the customer about status change
  const STATUS_MESSAGES: Record<string, { title: string; body: string }> = {
    out_for_delivery: { title: "Your order is on the way! 🚚", body: `Order #${orderId.slice(-6).toUpperCase()} has been picked up and is out for delivery.` },
    delivered: { title: "Order Delivered! ✅", body: `Order #${orderId.slice(-6).toUpperCase()} has been delivered. Enjoy!` },
  };
  const msg = STATUS_MESSAGES[status];
  if (msg && order.customerId) {
    try {
      await createNotificationLimited(order.customerId, {
        type: "order_update",
        title: msg.title,
        message: msg.body,
        data: { orderId, url: `/orders/${orderId}` },
      });
    } catch { /* ignore */ }
  }

  res.json({ success: true, order: mi(updated!) });
});

// POST /delivery/me/orders/:orderId/verify-otp — rider enters customer OTP to confirm delivery
router.post("/me/orders/:orderId/verify-otp", authenticate, validateUuidParams("orderId"), async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const orderId = req.params["orderId"] as string;
  const { otp, confirmCash } = req.body as { otp: string; confirmCash?: boolean };

  const [partner] = await db.select().from(deliveryPartners).where(eq(deliveryPartners.userId, userId)).limit(1);
  if (!partner) { res.status(403).json({ success: false, message: "Not a delivery partner" }); return; }

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) { res.status(404).json({ success: false, message: "Order not found" }); return; }
  if (order.deliveryPartnerId !== partner.id) {
    res.status(403).json({ success: false, message: "This order is not assigned to you" }); return;
  }
  if (order.status !== "out_for_delivery") {
    res.status(400).json({ success: false, message: "Order is not out for delivery" }); return;
  }
  if (!order.deliveryOtp || order.deliveryOtp !== String(otp ?? "").trim()) {
    res.status(400).json({ success: false, message: "Incorrect OTP. Please ask the customer for the correct code." }); return;
  }

  const isCod = (order.paymentMethod ?? "COD").toUpperCase() === "COD";
  const paymentStatusUpdate = (isCod && confirmCash) ? { paymentStatus: "paid" } : {};

  await db.update(deliveryPartners).set({
    ordersDelivered: partner.ordersDelivered + 1,
    totalEarnings: partner.totalEarnings + (order.deliveryCharge ?? 0),
    currentOrderId: null,
    updatedAt: new Date(),
  }).where(eq(deliveryPartners.id, partner.id));

  const [updated] = await db.update(orders)
    .set({ status: "delivered", ...paymentStatusUpdate, updatedAt: new Date() })
    .where(eq(orders.id, orderId))
    .returning();

  try {
    await createNotificationLimited(order.customerId, {
      type: "order_update",
      title: "Order Delivered! ✅",
      message: `Order #${orderId.slice(-6).toUpperCase()} has been delivered. Enjoy!`,
      data: { orderId, url: `/orders/${orderId}` },
    });
  } catch { /* ignore */ }

  res.json({ success: true, order: mi(updated!) });
});

// PATCH /delivery/me/orders/:orderId/confirm-payment — rider confirms COD cash collected
// Can be called after delivery for COD orders to set paymentStatus="paid".
router.patch("/me/orders/:orderId/confirm-payment", authenticate, validateUuidParams("orderId"), async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const orderId = req.params["orderId"] as string;

  const [partner] = await db.select().from(deliveryPartners).where(eq(deliveryPartners.userId, userId)).limit(1);
  if (!partner) { res.status(403).json({ success: false, message: "Not a delivery partner" }); return; }

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) { res.status(404).json({ success: false, message: "Order not found" }); return; }
  if (order.deliveryPartnerId !== partner.id) {
    res.status(403).json({ success: false, message: "This order is not assigned to you" });
    return;
  }
  if (order.status !== "delivered") {
    res.status(400).json({ success: false, message: "Order must be delivered first" });
    return;
  }
  if (order.paymentStatus === "paid") {
    res.json({ success: true, order: mi(order), message: "Payment already confirmed" });
    return;
  }

  const [updated] = await db.update(orders)
    .set({ paymentStatus: "paid", updatedAt: new Date() })
    .where(eq(orders.id, orderId))
    .returning();

  res.json({ success: true, order: mi(updated!) });
});

export default router;
