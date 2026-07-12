import { Router, type Request, type Response } from "express";
import { db, pushSubscriptions, users, adminBroadcasts } from "@workspace/db";
import { eq, and, count, sum, desc, inArray } from "drizzle-orm";
import { authenticate, requireRole, type AuthRequest } from "../../middlewares/auth.js";
import { vapidPublicKey, webpush } from "../../lib/webpush.js";

const router = Router();
const A = requireRole("admin", "super_admin");

// GET /api/push/vapid-public-key — public, used by frontend to subscribe
router.get("/vapid-public-key", (_req, res: Response): void => {
  res.json({ success: true, publicKey: vapidPublicKey });
});

// POST /api/push/subscribe — save or update a push subscription for this user
router.post("/subscribe", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const { endpoint, keys } = req.body as {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    res.status(400).json({ success: false, message: "Invalid subscription object" });
    return;
  }

  await db.delete(pushSubscriptions).where(
    and(eq(pushSubscriptions.userId, req.user!.userId), eq(pushSubscriptions.endpoint, endpoint))
  );
  await db.insert(pushSubscriptions).values({
    userId: req.user!.userId,
    endpoint,
    keys,
  });

  req.log.info({ userId: req.user!.userId, endpoint: endpoint.slice(0, 60) + "…" }, "Push subscription saved");
  res.json({ success: true });
});

// POST /api/push/unsubscribe — remove a push subscription
router.post("/unsubscribe", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const { endpoint } = req.body as { endpoint: string };
  if (endpoint) {
    await db.delete(pushSubscriptions).where(
      and(eq(pushSubscriptions.userId, req.user!.userId), eq(pushSubscriptions.endpoint, endpoint))
    );
  }
  res.json({ success: true });
});

// POST /api/push/test — send a real push to yourself to verify end-to-end setup
router.post("/test", authenticate, async (req: AuthRequest & Request, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));

  if (subs.length === 0) {
    res.status(404).json({
      success: false,
      message: "No push subscription found for your account. Enable notifications first.",
    });
    return;
  }

  const appUrl = process.env["APP_URL"] ?? `${req.protocol}://${req.get("host")}`;

  const pushPayload = JSON.stringify({
    title: "🔔 Test Notification",
    body:  "Push is working! You'll get alerts for orders & updates even when the app is closed.",
    icon:  `${appUrl}/logo.png`,
    badge: `${appUrl}/logo.png`,
    tag:   "test",
    data:  { url: "/notifications" },
  });

  let sent = 0;
  let failed = 0;

  for (const sub of subs) {
    const keys = sub.keys as { p256dh: string; auth: string };
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
        pushPayload,
        { TTL: 60, urgency: "high" }
      );
      sent++;
    } catch (err: unknown) {
      failed++;
      const e = err as { statusCode?: number; message?: string };
      console.error("[Push] Test send failed:", { status: e.statusCode, message: e.message });
      if (e.statusCode === 404 || e.statusCode === 410) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
      }
    }
  }

  if (sent > 0) {
    res.json({ success: true, message: `Test push sent to ${sent} device(s).`, sent, failed });
  } else {
    res.status(500).json({ success: false, message: "Push send failed — check server logs.", sent, failed });
  }
});

// GET /api/push/diagnostics — admin: push subscription health overview
router.get("/diagnostics", authenticate, A, async (_req: AuthRequest, res: Response): Promise<void> => {
  const [
    [{ totalUsers }],
    [{ totalSubs }],
    subsByRoleRows,
    lastBroadcastRows,
  ] = await Promise.all([
    db.select({ totalUsers: count() }).from(users),
    db.select({ totalSubs: count() }).from(pushSubscriptions),

    // Subscriptions per role — join push_subscriptions → users
    db
      .select({ role: users.role, cnt: count() })
      .from(pushSubscriptions)
      .innerJoin(users, eq(pushSubscriptions.userId, users.id))
      .groupBy(users.role),

    // Last broadcast
    db
      .select()
      .from(adminBroadcasts)
      .orderBy(desc(adminBroadcasts.createdAt))
      .limit(1),
  ]);

  // All-time push totals — may fail if push_sent/push_failed columns don't exist yet (pre-publish)
  let allTimePushSent = 0;
  let allTimePushFailed = 0;
  try {
    const [totals] = await db
      .select({
        allTimeSent:   sum(adminBroadcasts.pushSent),
        allTimeFailed: sum(adminBroadcasts.pushFailed),
      })
      .from(adminBroadcasts);
    allTimePushSent   = Number(totals?.allTimeSent   ?? 0);
    allTimePushFailed = Number(totals?.allTimeFailed ?? 0);
  } catch { /* columns missing in production — returns 0 */ }

  const subsByRole: Record<string, number> = {};
  for (const row of subsByRoleRows) {
    subsByRole[row.role] = Number(row.cnt);
  }

  const lastBroadcast = lastBroadcastRows[0] ?? null;

  res.json({
    success: true,
    totalUsers: Number(totalUsers),
    totalSubscriptions: Number(totalSubs),
    subsByRole,
    lastBroadcast: lastBroadcast
      ? {
          title:      lastBroadcast.title,
          pushSent:   lastBroadcast.pushSent ?? 0,
          pushFailed: lastBroadcast.pushFailed ?? 0,
          sentCount:  lastBroadcast.sentCount,
          createdAt:  lastBroadcast.createdAt,
        }
      : null,
    allTimePushSent,
    allTimePushFailed,
  });
});

export default router;
