import { Router, type Response } from "express";
import { db, admins, users, shops, orders, deliveryPartners, payouts } from "@workspace/db";
import { eq, and, inArray, count, sum, gte } from "drizzle-orm";
import { authenticate, requireRole, type AuthRequest } from "../../middlewares/auth.js";
import { mi, miArr } from "../../utils/mapId.js";

const router = Router();
const SA = requireRole("super_admin");
const A = requireRole("admin", "super_admin");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/admin/stats
router.get("/stats", authenticate, A, async (_req, res: Response): Promise<void> => {
  const [
    [{ totalUsers }],
    [{ totalShops }],
    [{ pendingShops }],
    [{ totalOrders }],
    [{ pendingOrders }],
    [{ activeDelivery }],
    [{ pendingPayouts }],
    revenueResult,
  ] = await Promise.all([
    db.select({ totalUsers: count() }).from(users).where(eq(users.role, "customer")),
    db.select({ totalShops: count() }).from(shops).where(eq(shops.status, "approved")),
    db.select({ pendingShops: count() }).from(shops).where(eq(shops.status, "pending")),
    db.select({ totalOrders: count() }).from(orders),
    // Active statuses in the real order lifecycle (placed → confirmed → packed → out_for_delivery → delivered)
    db.select({ pendingOrders: count() }).from(orders).where(inArray(orders.status, ["placed", "confirmed", "packed", "out_for_delivery"])),
    db.select({ activeDelivery: count() }).from(deliveryPartners).where(and(eq(deliveryPartners.status, "active"), eq(deliveryPartners.isAvailable, true))),
    db.select({ pendingPayouts: count() }).from(payouts).where(eq(payouts.status, "pending")),
    db.select({ totalRevenue: sum(orders.netAmount), totalCommission: sum(orders.commissionAmount) }).from(orders).where(eq(orders.status, "delivered")),
  ]);

  res.json({
    success: true,
    stats: {
      totalUsers: Number(totalUsers),
      totalShops: Number(totalShops),
      pendingShops: Number(pendingShops),
      totalOrders: Number(totalOrders),
      pendingOrders: Number(pendingOrders),
      activeDelivery: Number(activeDelivery),
      pendingPayouts: Number(pendingPayouts),
      totalRevenue: Number(revenueResult[0]?.totalRevenue ?? 0),
      totalCommission: Number(revenueResult[0]?.totalCommission ?? 0),
    },
  });
});

// GET /api/admin/user-signups
router.get("/user-signups", authenticate, A, async (_req, res: Response): Promise<void> => {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const result = await db.select({ createdAt: users.createdAt }).from(users)
    .where(and(eq(users.role, "customer"), gte(users.createdAt, sixMonthsAgo)));
  const dates = result.map((u) => u.createdAt.toISOString());
  res.json({ success: true, dates });
});

// GET /api/admin/admins
router.get("/admins", authenticate, SA, async (_req, res: Response): Promise<void> => {
  const result = await db.select({
    id: admins.id, phone: admins.phone, name: admins.name, role: admins.role,
    status: admins.status, addedBy: admins.addedBy, createdAt: admins.createdAt, updatedAt: admins.updatedAt,
  }).from(admins).orderBy(admins.createdAt);
  res.json({ success: true, admins: miArr(result) });
});

// POST /api/admin/admins
router.post("/admins", authenticate, SA, async (req: AuthRequest, res: Response): Promise<void> => {
  const { phone, name, role = "admin" } = req.body as { phone: string; name: string; role?: "admin" | "super_admin" };
  if (!phone || !name) { res.status(400).json({ success: false, message: "Phone and name required" }); return; }
  const [existing] = await db.select().from(admins).where(eq(admins.phone, phone)).limit(1);
  if (existing) { res.status(409).json({ success: false, message: "Admin with this phone already exists" }); return; }
  const [admin] = await db.insert(admins).values({ phone, name, role, status: "active", addedBy: req.user!.userId }).returning();
  await db.update(users).set({ role }).where(eq(users.phone, phone));
  res.status(201).json({ success: true, admin: mi(admin) });
});

// PATCH /api/admin/admins/:id
router.patch("/admins/:id", authenticate, SA, async (req: AuthRequest, res: Response): Promise<void> => {
  if (!UUID_RE.test(req.params["id"] as string)) {
    res.status(400).json({ success: false, message: "Invalid admin ID" });
    return;
  }
  const { role, status } = req.body as { role?: "admin" | "super_admin"; status?: "active" | "suspended" };
  const update: Record<string, unknown> = {};
  if (role) update.role = role;
  if (status) update.status = status;
  const [admin] = await db.update(admins).set(update).where(eq(admins.id, req.params["id"] as string)).returning();
  if (!admin) { res.status(404).json({ success: false, message: "Admin not found" }); return; }
  res.json({ success: true, admin: mi(admin) });
});

// DELETE /api/admin/admins/:id
router.delete("/admins/:id", authenticate, SA, async (req: AuthRequest, res: Response): Promise<void> => {
  if (!UUID_RE.test(req.params["id"] as string)) {
    res.status(400).json({ success: false, message: "Invalid admin ID" });
    return;
  }
  await db.delete(admins).where(eq(admins.id, req.params["id"] as string));
  res.json({ success: true, message: "Admin removed" });
});

export default router;
