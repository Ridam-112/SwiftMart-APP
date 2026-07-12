import { Router, type Request, type Response } from "express";
import { db, shopTypes } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { authenticate, requireRole, type AuthRequest } from "../../middlewares/auth.js";
import { mi, miArr } from "../../utils/mapId.js";

const router = Router();
const A = requireRole("admin", "super_admin");

router.get("/", async (_req: Request, res: Response): Promise<void> => {
  const types = await db.select().from(shopTypes).orderBy(asc(shopTypes.name));
  res.json({ success: true, shopTypes: miArr(types) });
});

router.get("/active", async (_req: Request, res: Response): Promise<void> => {
  const types = await db.select().from(shopTypes).where(eq(shopTypes.isActive, true)).orderBy(asc(shopTypes.name));
  res.json({ success: true, shopTypes: miArr(types) });
});

router.post("/", authenticate, A, async (req: AuthRequest, res: Response): Promise<void> => {
  const { name, commissionRate } = req.body as { name: string; commissionRate?: number };
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const [st] = await db.insert(shopTypes).values({ name, slug, commissionRate, isActive: true }).returning();
  res.status(201).json({ success: true, shopType: mi(st) });
});

router.patch("/:id", authenticate, A, async (req: AuthRequest, res: Response): Promise<void> => {
  const [st] = await db.update(shopTypes).set(req.body as Record<string, unknown>).where(eq(shopTypes.id, req.params["id"] as string)).returning();
  if (!st) { res.status(404).json({ success: false, message: "Not found" }); return; }
  res.json({ success: true, shopType: mi(st) });
});

router.delete("/:id", authenticate, A, async (req: AuthRequest, res: Response): Promise<void> => {
  await db.delete(shopTypes).where(eq(shopTypes.id, req.params["id"] as string));
  res.json({ success: true, message: "Deleted" });
});

export default router;
