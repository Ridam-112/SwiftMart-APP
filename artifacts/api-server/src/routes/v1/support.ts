import { Router, type Response } from "express";
import { db, supportTickets } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { authenticate, requireRole, type AuthRequest } from "../../middlewares/auth.js";
import { mi, miArr } from "../../utils/mapId.js";

const router = Router();
const A = requireRole("admin", "super_admin");

router.post("/", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const subject = String(body["subject"] ?? "").trim();
  const message = String(body["message"] ?? "").trim();
  const category = String(body["category"] ?? "general").trim();

  if (!subject || !message) {
    res.status(400).json({ success: false, message: "Subject and message are required" });
    return;
  }

  const [ticket] = await db.insert(supportTickets).values({
    userId: req.user!.userId,
    userPhone: req.user!.phone ?? "",
    userName: String(body["userName"] ?? ""),
    category,
    subject,
    message,
    status: "open",
  }).returning();

  res.status(201).json({ success: true, ticket: mi(ticket!) });
});

router.get("/mine", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const rows = await db.select().from(supportTickets)
    .where(eq(supportTickets.userId, req.user!.userId))
    .orderBy(desc(supportTickets.createdAt));
  res.json({ success: true, tickets: miArr(rows) });
});

router.get("/", authenticate, A, async (_req: AuthRequest, res: Response): Promise<void> => {
  const rows = await db.select().from(supportTickets).orderBy(desc(supportTickets.createdAt));
  res.json({ success: true, tickets: miArr(rows) });
});

router.patch("/:id/resolve", authenticate, A, async (req: AuthRequest, res: Response): Promise<void> => {
  const { adminNote } = req.body as { adminNote?: string };
  const [ticket] = await db.update(supportTickets)
    .set({ status: "resolved", resolvedBy: req.user!.userId, adminNote: adminNote ?? null, updatedAt: new Date() })
    .where(eq(supportTickets.id, req.params["id"] as string))
    .returning();
  if (!ticket) { res.status(404).json({ success: false, message: "Ticket not found" }); return; }
  res.json({ success: true, ticket: mi(ticket) });
});

router.patch("/:id/close", authenticate, A, async (req: AuthRequest, res: Response): Promise<void> => {
  const [ticket] = await db.update(supportTickets)
    .set({ status: "closed", resolvedBy: req.user!.userId, updatedAt: new Date() })
    .where(eq(supportTickets.id, req.params["id"] as string))
    .returning();
  if (!ticket) { res.status(404).json({ success: false, message: "Ticket not found" }); return; }
  res.json({ success: true, ticket: mi(ticket) });
});

export default router;
