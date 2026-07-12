import { Router, type Response } from "express";
import { db, commissionRules } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { authenticate, requireRole, type AuthRequest } from "../../middlewares/auth.js";
import { mi, miArr } from "../../utils/mapId.js";

const router = Router();
const A = requireRole("admin", "super_admin");

const VALID_LEVELS = new Set(["product", "vendor", "category", "shopType", "global"]);
const VALID_TYPES = new Set(["percentage", "fixed"]);

router.get("/", authenticate, A, async (req: AuthRequest, res: Response): Promise<void> => {
  const conditions = [];
  if (req.query["level"]) conditions.push(eq(commissionRules.level, String(req.query["level"])));
  if (req.query["targetId"]) conditions.push(eq(commissionRules.targetId, String(req.query["targetId"])));
  const where = conditions.length ? and(...conditions) : undefined;
  const rules = await db.select().from(commissionRules).where(where).orderBy(asc(commissionRules.level));
  res.json({ success: true, rules: miArr(rules) });
});

router.post("/", authenticate, A, async (req: AuthRequest, res: Response): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const level = String(body["level"] ?? "");
  const type = body["type"] ? String(body["type"]) : "percentage";
  if (!VALID_LEVELS.has(level)) {
    res.status(400).json({ success: false, message: `Invalid level. Must be one of: ${[...VALID_LEVELS].join(", ")}` });
    return;
  }
  if (!VALID_TYPES.has(type)) {
    res.status(400).json({ success: false, message: `Invalid type. Must be one of: ${[...VALID_TYPES].join(", ")}` });
    return;
  }
  const rate = Number(body["rate"] ?? 5);
  if (isNaN(rate) || rate < 0) {
    res.status(400).json({ success: false, message: "rate must be a non-negative number" });
    return;
  }
  const [rule] = await db.insert(commissionRules).values({
    level,
    type,
    targetId: body["targetId"] ? String(body["targetId"]) : undefined,
    targetName: body["targetName"] ? String(body["targetName"]) : undefined,
    rate,
    isActive: body["isActive"] != null ? Boolean(body["isActive"]) : true,
  }).returning();
  res.status(201).json({ success: true, rule: mi(rule!) });
});

router.patch("/:id", authenticate, A, async (req: AuthRequest, res: Response): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const update: Record<string, unknown> = {};
  if (body["level"] !== undefined) {
    const level = String(body["level"]);
    if (!VALID_LEVELS.has(level)) {
      res.status(400).json({ success: false, message: `Invalid level. Must be one of: ${[...VALID_LEVELS].join(", ")}` });
      return;
    }
    update["level"] = level;
  }
  if (body["type"] !== undefined) {
    const type = String(body["type"]);
    if (!VALID_TYPES.has(type)) {
      res.status(400).json({ success: false, message: `Invalid type. Must be one of: ${[...VALID_TYPES].join(", ")}` });
      return;
    }
    update["type"] = type;
  }
  if (body["rate"] !== undefined) update["rate"] = Number(body["rate"]);
  if (body["targetId"] !== undefined) update["targetId"] = body["targetId"] ? String(body["targetId"]) : null;
  if (body["targetName"] !== undefined) update["targetName"] = body["targetName"] ? String(body["targetName"]) : null;
  if (body["isActive"] !== undefined) update["isActive"] = Boolean(body["isActive"]);
  const [rule] = await db.update(commissionRules)
    .set(update)
    .where(eq(commissionRules.id, req.params["id"] as string))
    .returning();
  if (!rule) { res.status(404).json({ success: false, message: "Not found" }); return; }
  res.json({ success: true, rule: mi(rule) });
});

router.delete("/:id", authenticate, A, async (req: AuthRequest, res: Response): Promise<void> => {
  await db.delete(commissionRules).where(eq(commissionRules.id, req.params["id"] as string));
  res.json({ success: true, message: "Deleted" });
});

export default router;
