import { Router, type Response } from "express";
import { db, notifications, adminBroadcasts, users } from "@workspace/db";
import { eq, and, desc, count, sql } from "drizzle-orm";
import { authenticate, requireRole, type AuthRequest } from "../../middlewares/auth.js";
import { createNotificationLimited, sendPushToUsers, trimNotificationsForUser } from "../../utils/notification.js";
import { miArr } from "../../utils/mapId.js";

const router = Router();
const A = requireRole("admin", "super_admin");

// GET /api/notifications — current user's notifications with pagination (L7)
router.get("/", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const uid = req.user!.userId;
  const limit = Math.min(parseInt((req.query["limit"] as string) ?? "10"), 10);
  const page = Math.max(parseInt((req.query["page"] as string) ?? "1"), 1);
  const offset = (page - 1) * limit;

  const [rows, [{ unread }], [{ total }]] = await Promise.all([
    db.select().from(notifications)
      .where(eq(notifications.userId, uid))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ unread: count() }).from(notifications)
      .where(and(eq(notifications.userId, uid), eq(notifications.isRead, false))),
    db.select({ total: count() }).from(notifications)
      .where(eq(notifications.userId, uid)),
  ]);
  res.json({
    success: true,
    notifications: miArr(rows),
    unreadCount: Number(unread),
    total: Number(total),
    page,
    pages: Math.ceil(Number(total) / limit),
  });
});

// PATCH /api/notifications/read-all — mark all unread as read
// Must be defined before /:id/read to avoid route conflict
router.patch("/read-all", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  await db.update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.userId, req.user!.userId), eq(notifications.isRead, false)));
  res.json({ success: true, message: "All notifications marked as read" });
});

// PATCH /api/notifications/:id/read
router.patch("/:id/read", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  await db.update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.id, req.params["id"] as string), eq(notifications.userId, req.user!.userId)));
  res.json({ success: true });
});

// POST /api/notifications/broadcast — admin sends to audience
router.post("/broadcast", authenticate, A, async (req: AuthRequest, res: Response): Promise<void> => {
  const { title, message, targetAudience, targetUserId } =
    req.body as { title: string; message: string; targetAudience: string; targetUserId?: string };

  if (!title || !message || !targetAudience) {
    res.status(400).json({ success: false, message: "title, message and targetAudience are required" });
    return;
  }

  let recipientIds: string[];

  if (targetAudience === "specific") {
    if (!targetUserId) {
      res.status(400).json({ success: false, message: "targetUserId required for specific audience" });
      return;
    }
    recipientIds = [targetUserId];
  } else if (targetAudience === "customers") {
    const rows = await db.select({ id: users.id }).from(users).where(eq(users.role, "customer"));
    recipientIds = rows.map(r => r.id);
  } else if (targetAudience === "vendors") {
    const rows = await db.select({ id: users.id }).from(users).where(eq(users.role, "vendor"));
    recipientIds = rows.map(r => r.id);
  } else {
    const rows = await db.select({ id: users.id }).from(users);
    recipientIds = rows.map(r => r.id);
  }

  const payload = { type: "system" as const, title, message };

  // Save in-app notifications (noPush=true — we handle push separately to get counts)
  await Promise.all(recipientIds.map(id =>
    createNotificationLimited(id, payload, { noPush: true })
  ));

  // Send push notifications and collect delivery counts
  const { sent: pushSent, failed: pushFailed } = await sendPushToUsers(recipientIds, payload);

  try {
    await db.insert(adminBroadcasts).values({
      title,
      message,
      targetAudience,
      targetUserId,
      sentCount: recipientIds.length,
      pushSent,
      pushFailed,
    });
  } catch {
    // Fallback for production DB not yet migrated (push_sent/push_failed columns may be missing)
    await db.insert(adminBroadcasts).values({
      title,
      message,
      targetAudience,
      targetUserId,
      sentCount: recipientIds.length,
    });
  }

  req.log.info({ inApp: recipientIds.length, pushSent, pushFailed }, "Broadcast complete");

  res.json({ success: true, sentCount: recipientIds.length, pushSent, pushFailed });
});

// GET /api/notifications/broadcasts — admin broadcast history
router.get("/broadcasts", authenticate, A, async (_req: AuthRequest, res: Response): Promise<void> => {
  const broadcasts = await db.select().from(adminBroadcasts).orderBy(desc(adminBroadcasts.createdAt)).limit(50);
  res.json({ success: true, broadcasts: miArr(broadcasts) });
});

// POST /api/notifications/admin/cleanup — admin: trim all users to 10-notification cap
router.post("/admin/cleanup", authenticate, A, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const allUsers = await db
      .select({ userId: notifications.userId, cnt: count() })
      .from(notifications)
      .groupBy(notifications.userId)
      .having(({ cnt }) => sql`${cnt} > 10`);

    if (allUsers.length === 0) {
      res.json({ success: true, message: "All users already within the 10-notification limit.", trimmed: 0 });
      return;
    }

    await Promise.all(allUsers.map(({ userId }) => trimNotificationsForUser(userId)));

    res.json({
      success: true,
      message: `Trimmed notifications for ${allUsers.length} user(s) to the 10-item cap.`,
      trimmed: allUsers.length,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Cleanup failed", error: String(err) });
  }
});

export default router;
