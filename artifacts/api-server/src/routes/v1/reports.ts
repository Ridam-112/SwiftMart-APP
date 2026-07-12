import { Router, type Response } from "express";
import { db, reports } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { authenticate, requireRole, type AuthRequest } from "../../middlewares/auth.js";
import { mi, miArr } from "../../utils/mapId.js";

const router = Router();
const A = requireRole("admin", "super_admin");

router.get("/", authenticate, A, async (req: AuthRequest, res: Response): Promise<void> => {
  const { status } = req.query as { status?: string };
  const where = status ? eq(reports.status, status) : undefined;
  const rows = await db.select().from(reports).where(where).orderBy(desc(reports.createdAt));
  res.json({ success: true, reports: miArr(rows) });
});

router.post("/", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const [report] = await db.insert(reports).values({
    type: String(body["type"] ?? ""),
    targetId: String(body["targetId"] ?? ""),
    targetName: body["targetName"] ? String(body["targetName"]) : "",
    reportedBy: req.user!.userId,
    reporterPhone: req.user!.phone ?? "",
    reason: String(body["reason"] ?? ""),
    description: body["description"] ? String(body["description"]) : undefined,
    status: "open",
  }).returning();
  res.status(201).json({ success: true, report: mi(report!) });
});

router.patch("/:id/resolve", authenticate, A, async (req: AuthRequest, res: Response): Promise<void> => {
  const [report] = await db.update(reports)
    .set({ status: "resolved", resolvedBy: req.user!.userId })
    .where(eq(reports.id, req.params["id"] as string))
    .returning();
  if (!report) { res.status(404).json({ success: false, message: "Not found" }); return; }
  res.json({ success: true, report: mi(report) });
});

router.patch("/:id/ignore", authenticate, A, async (req: AuthRequest, res: Response): Promise<void> => {
  const [report] = await db.update(reports)
    .set({ status: "ignored", resolvedBy: req.user!.userId })
    .where(eq(reports.id, req.params["id"] as string))
    .returning();
  if (!report) { res.status(404).json({ success: false, message: "Not found" }); return; }
  res.json({ success: true, report: mi(report) });
});

export default router;
