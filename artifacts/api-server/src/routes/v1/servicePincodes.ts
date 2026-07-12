import { Router, type Response } from "express";
import { db, servicePincodes } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authenticate, requireRole, type AuthRequest } from "../../middlewares/auth.js";

const router = Router();
const A = requireRole("admin", "super_admin");

router.get("/", authenticate, A, async (_req, res: Response): Promise<void> => {
  const rows = await db.select().from(servicePincodes).orderBy(servicePincodes.createdAt);
  // service_pincodes has no `id` column — return rows directly (pincode is the PK)
  res.json({ success: true, pincodes: rows });
});

router.post("/", authenticate, A, async (req: AuthRequest, res: Response): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const pincode = String(body["pincode"] ?? "").trim().replace(/\D/g, "");
  const area    = String(body["area"] ?? "").trim();
  const state   = String(body["state"] ?? "West Bengal").trim();

  if (!pincode || pincode.length !== 6) {
    res.status(400).json({ success: false, message: "pincode must be a 6-digit number" });
    return;
  }
  if (!area) {
    res.status(400).json({ success: false, message: "area is required" });
    return;
  }

  const [row] = await db
    .insert(servicePincodes)
    .values({ pincode, area, state, isActive: true })
    .onConflictDoUpdate({
      target: servicePincodes.pincode,
      set: { area, state, updatedAt: new Date() },
    })
    .returning();
  res.status(201).json({ success: true, pincode: row });
});

router.patch("/:pincode", authenticate, A, async (req: AuthRequest, res: Response): Promise<void> => {
  const pincode = req.params["pincode"] as string;
  const body = req.body as Record<string, unknown>;
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (body["area"]     !== undefined) update["area"]     = String(body["area"]);
  if (body["state"]    !== undefined) update["state"]    = String(body["state"]);
  if (body["isActive"] !== undefined) update["isActive"] = Boolean(body["isActive"]);

  const [row] = await db
    .update(servicePincodes)
    .set(update)
    .where(eq(servicePincodes.pincode, pincode))
    .returning();
  if (!row) { res.status(404).json({ success: false, message: "Not found" }); return; }
  res.json({ success: true, pincode: row });
});

router.delete("/:pincode", authenticate, A, async (req: AuthRequest, res: Response): Promise<void> => {
  const pincode = req.params["pincode"] as string;
  await db.delete(servicePincodes).where(eq(servicePincodes.pincode, pincode));
  res.json({ success: true });
});

export default router;
