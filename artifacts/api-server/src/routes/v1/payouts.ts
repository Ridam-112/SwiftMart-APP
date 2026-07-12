import { Router, type Response } from "express";
import { db, payouts, shops } from "@workspace/db";
import { eq, and, inArray, desc } from "drizzle-orm";
import { authenticate, requireRole, type AuthRequest } from "../../middlewares/auth.js";
import { mi, miArr } from "../../utils/mapId.js";

const router = Router();
const A = requireRole("admin", "super_admin");

// GET /api/payouts — admin: see all payouts
router.get("/", authenticate, A, async (req: AuthRequest, res: Response): Promise<void> => {
  const { status } = req.query as { status?: string };
  const where = status ? eq(payouts.status, status) : undefined;
  const rows = await db.select().from(payouts).where(where).orderBy(desc(payouts.createdAt));
  res.json({ success: true, payouts: miArr(rows) });
});

// GET /api/payouts/my — vendor: see payouts for their own shops only
router.get("/my", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const { status } = req.query as { status?: string };

  // Resolve all shops owned by this vendor
  const vendorShops = await db.select({ id: shops.id }).from(shops).where(eq(shops.ownerId, req.user!.userId));
  if (vendorShops.length === 0) {
    res.json({ success: true, payouts: [], totalEarned: 0, pendingAmount: 0 });
    return;
  }

  const shopIds = vendorShops.map(s => s.id);
  const conditions = [inArray(payouts.shopId, shopIds)];
  if (status) conditions.push(eq(payouts.status, status));

  const rows = await db.select().from(payouts).where(and(...conditions)).orderBy(desc(payouts.createdAt));
  const totalEarned = rows.filter(r => r.status === "paid").reduce((s, r) => s + (r.amount ?? 0), 0);
  const pendingAmount = rows.filter(r => r.status === "pending").reduce((s, r) => s + (r.amount ?? 0), 0);

  res.json({ success: true, payouts: miArr(rows), totalEarned, pendingAmount });
});

router.patch("/:id/status", authenticate, A, async (req: AuthRequest, res: Response): Promise<void> => {
  const { status, notes } = req.body as { status: string; notes?: string };
  const updatePayload: Record<string, unknown> = { status, notes };
  if (status === "paid") updatePayload["paidAt"] = new Date();
  const [payout] = await db.update(payouts)
    .set(updatePayload)
    .where(eq(payouts.id, req.params["id"] as string))
    .returning();
  if (!payout) { res.status(404).json({ success: false, message: "Not found" }); return; }
  res.json({ success: true, payout: mi(payout) });
});

export default router;
