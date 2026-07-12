import { Router, type Request, type Response } from "express";
import { db, categories } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { authenticate, requireRole, type AuthRequest } from "../../middlewares/auth.js";
import { mi, miArr } from "../../utils/mapId.js";

const router = Router();
const A = requireRole("admin", "super_admin");

router.get("/", async (_req: Request, res: Response): Promise<void> => {
  const cats = await db.select().from(categories).where(eq(categories.isActive, true)).orderBy(asc(categories.name));
  res.json({ success: true, categories: miArr(cats) });
});

router.get("/all", authenticate, A, async (_req: Request, res: Response): Promise<void> => {
  const cats = await db.select().from(categories).orderBy(asc(categories.name));
  res.json({ success: true, categories: miArr(cats) });
});

router.post("/", authenticate, A, async (req: AuthRequest, res: Response): Promise<void> => {
  const { name, shopTypes: shopTypesList, commissionRate, emoji, color, subcategories } = req.body as {
    name: string; shopTypes?: string[]; commissionRate?: number; emoji?: string; color?: string; subcategories?: string[];
  };
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const [cat] = await db.insert(categories).values({ name, slug, shopTypes: shopTypesList ?? [], commissionRate, emoji, color, subcategories: subcategories ?? [] }).returning();
  res.status(201).json({ success: true, category: mi(cat) });
});

router.patch("/:id", authenticate, A, async (req: AuthRequest, res: Response): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const update: Record<string, unknown> = {};
  if (body["name"] !== undefined) update["name"] = String(body["name"]);
  if (body["shopTypes"] !== undefined) update["shopTypes"] = Array.isArray(body["shopTypes"]) ? body["shopTypes"] : [];
  if (body["commissionRate"] !== undefined) update["commissionRate"] = Number(body["commissionRate"]);
  if (body["emoji"] !== undefined) update["emoji"] = body["emoji"] ? String(body["emoji"]) : null;
  if (body["color"] !== undefined) update["color"] = body["color"] ? String(body["color"]) : null;
  if (body["subcategories"] !== undefined) update["subcategories"] = Array.isArray(body["subcategories"]) ? body["subcategories"] : [];
  if (body["isActive"] !== undefined) update["isActive"] = Boolean(body["isActive"]);
  const [cat] = await db.update(categories).set(update).where(eq(categories.id, req.params["id"] as string)).returning();
  if (!cat) { res.status(404).json({ success: false, message: "Not found" }); return; }
  res.json({ success: true, category: mi(cat) });
});

router.delete("/:id", authenticate, A, async (req: AuthRequest, res: Response): Promise<void> => {
  await db.delete(categories).where(eq(categories.id, req.params["id"] as string));
  res.json({ success: true, message: "Deleted" });
});

export default router;
