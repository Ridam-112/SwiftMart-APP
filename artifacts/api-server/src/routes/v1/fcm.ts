import { Router, type Response } from "express";
import { db, fcmTokens, users, adminBroadcasts } from "@workspace/db";
import { eq, and, count, sum, desc, inArray } from "drizzle-orm";
import { authenticate, requireRole, type AuthRequest } from "../../middlewares/auth.js";
import { getMessagingInstance } from "../../lib/firebase-admin.js";
import { logger } from "../../lib/logger.js";

const router = Router();
const A = requireRole("admin", "super_admin");

// GET /api/fcm/config — public: frontend fetches this to get the FCM VAPID key
router.get("/config", (_req, res: Response): void => {
  // Resolve VAPID key: prefer FIREBASE_VAPID_KEY, but if it's set to its own name
  // (a common misconfiguration), fall through to VITE_FIREBASE_VAPID_KEY then VAPID_PUBLIC_KEY.
  const candidates = [
    process.env["FIREBASE_VAPID_KEY"],
    process.env["VITE_FIREBASE_VAPID_KEY"],
    process.env["VAPID_PUBLIC_KEY"],
  ];
  const SELF_NAMES = new Set(["FIREBASE_VAPID_KEY", "VITE_FIREBASE_VAPID_KEY", "VAPID_PUBLIC_KEY"]);
  const vapidKey = candidates.find(v => v && !SELF_NAMES.has(v)) ?? "";
  res.json({ success: true, vapidKey });
});

// POST /api/fcm/register-token — save or refresh an FCM token for this user
router.post("/register-token", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const { token, platform = "web" } = req.body as { token: string; platform?: string };

  if (!token || typeof token !== "string") {
    res.status(400).json({ success: false, message: "FCM token is required" });
    return;
  }

  const userId    = req.user!.userId;
  const role      = req.user!.role;
  const userAgent = req.headers["user-agent"] ?? null;

  try {
    const existing = await db.select({ id: fcmTokens.id }).from(fcmTokens).where(eq(fcmTokens.token, token)).limit(1);

    if (existing.length > 0) {
      await db.update(fcmTokens)
        .set({ userId, role, platform, userAgent, isActive: true, lastSeenAt: new Date(), updatedAt: new Date() })
        .where(eq(fcmTokens.token, token));
    } else {
      await db.insert(fcmTokens).values({ userId, token, platform, role, userAgent, isActive: true });
    }

    logger.info({ userId, platform, role }, "[FCM] Token registered");
    res.json({ success: true });
  } catch (err) {
    logger.error({ err, userId }, "[FCM] register-token error");
    res.status(500).json({ success: false, message: "Failed to save FCM token" });
  }
});

// POST /api/fcm/unregister-token — deactivate a specific FCM token
router.post("/unregister-token", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const { token } = req.body as { token?: string };
  if (token) {
    await db.update(fcmTokens)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(fcmTokens.token, token), eq(fcmTokens.userId, req.user!.userId)));
  }
  res.json({ success: true });
});

// POST /api/fcm/unregister-all — deactivate ALL tokens for this user
router.post("/unregister-all", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  await db.update(fcmTokens)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(fcmTokens.userId, userId), eq(fcmTokens.isActive, true)));
  logger.info({ userId }, "[FCM] unregister-all");
  res.json({ success: true });
});

// GET /api/fcm/my-token — check if the current user has an active FCM token
router.get("/my-token", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const rows = await db
      .select({ token: fcmTokens.token, platform: fcmTokens.platform, lastSeenAt: fcmTokens.lastSeenAt, isActive: fcmTokens.isActive })
      .from(fcmTokens)
      .where(and(eq(fcmTokens.userId, userId), eq(fcmTokens.isActive, true)))
      .limit(5);

    res.json({
      success: true,
      hasToken: rows.length > 0,
      count: rows.length,
      tokens: rows.map((r: typeof rows[number]) => ({
        platform: r.platform,
        lastSeen: r.lastSeenAt,
        tokenPreview: r.token.substring(0, 20) + "...",
      })),
    });
  } catch (err) {
    logger.error({ err }, "[FCM] my-token error");
    res.status(500).json({ success: false, message: "Failed to check token" });
  }
});

// POST /api/fcm/test — send a test FCM push to yourself
router.post("/test", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;

    const allTokens = await db
      .select({ token: fcmTokens.token, isActive: fcmTokens.isActive, platform: fcmTokens.platform, updatedAt: fcmTokens.updatedAt })
      .from(fcmTokens)
      .where(eq(fcmTokens.userId, userId));

    const activeTokens = allTokens.filter(t => t.isActive);

    logger.info({ userId, totalTokens: allTokens.length, activeTokens: activeTokens.length }, "[FCM] /test");

    if (activeTokens.length === 0) {
      res.status(404).json({
        success: false,
        message: "No active FCM tokens. Enable notifications first.",
        debug: { totalTokensInDb: allTokens.length, tokens: allTokens.map(t => ({ active: t.isActive, platform: t.platform, updatedAt: t.updatedAt })) },
      });
      return;
    }

    const messaging = getMessagingInstance();
    if (!messaging) {
      const projectId   = process.env["FIREBASE_PROJECT_ID"] ?? process.env["VITE_FIREBASE_PROJECT_ID"] ?? "(not set)";
      const clientEmail = process.env["FIREBASE_CLIENT_EMAIL"] ? "(set)" : "(not set)";
      const privateKey  = process.env["FIREBASE_PRIVATE_KEY"]  ? "(set)" : "(not set)";
      logger.error({ projectId, clientEmail, privateKey }, "[FCM] getMessagingInstance returned null");
      res.status(503).json({
        success: false,
        message: "FCM not configured on server. Set FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY.",
        debug: { projectId, clientEmail, privateKey },
      });
      return;
    }

    const appUrl = (process.env["APP_URL"] ?? `${(req as { protocol: string }).protocol}://${(req as { get: (h: string) => string }).get("host")}`).replace(/\/+$/, "");
    const tokenStrings = activeTokens.map(t => t.token);

    logger.info({ tokenCount: tokenStrings.length, projectId: process.env["FIREBASE_PROJECT_ID"] ?? process.env["VITE_FIREBASE_PROJECT_ID"] }, "[FCM] Sending test push");

    const result = await messaging.sendEachForMulticast({
      tokens: tokenStrings,
      notification: {
        title: "Test Notification",
        body:  "Push is working! You'll get alerts for orders and updates.",
        imageUrl: `${appUrl}/logo.png`,
      },
      data: { type: "system", url: `${appUrl}/notifications` },
      webpush: {
        notification: {
          icon:  `${appUrl}/logo.png`,
          badge: `${appUrl}/logo.png`,
          tag:   "swiftmart-test",
          requireInteraction: false,
        },
        fcmOptions: { link: `${appUrl}/notifications` },
      },
    });

    const { successCount, failureCount, responses } = result;

    responses.forEach((resp, i) => {
      if (resp.success) {
        logger.info({ index: i, messageId: resp.messageId }, "[FCM] Token OK");
      } else {
        logger.error({ index: i, code: resp.error?.code, message: resp.error?.message }, "[FCM] Token FAILED");
      }
    });

    const staleErrorCodes = new Set([
      "messaging/registration-token-not-registered",
      "messaging/invalid-registration-token",
      "messaging/invalid-argument",
    ]);
    const toDeactivate = responses
      .map((resp, i) => (!resp.success && resp.error?.code && staleErrorCodes.has(resp.error.code) ? tokenStrings[i] : null))
      .filter(Boolean) as string[];

    if (toDeactivate.length > 0) {
      await db.update(fcmTokens).set({ isActive: false, updatedAt: new Date() }).where(inArray(fcmTokens.token, toDeactivate));
      logger.info({ count: toDeactivate.length }, "[FCM] Deactivated stale tokens");
    }

    const perTokenErrors = responses
      .filter(r => !r.success)
      .map(r => ({ code: r.error?.code, message: r.error?.message }));

    if (successCount > 0) {
      res.json({ success: true, message: `Test push sent to ${successCount} device(s).`, sent: successCount, failed: failureCount });
    } else {
      res.status(422).json({
        success: false,
        message: "All tokens rejected by Firebase. Your FCM token may be stale — re-enable notifications.",
        sent: 0,
        failed: failureCount,
        errors: perTokenErrors,
      });
    }
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string; errorInfo?: unknown; stack?: string };
    logger.error({ err, code: e?.code }, "[FCM] /test exception");
    res.status(500).json({
      success: false,
      message: e?.message ?? "FCM send error",
      code: e?.code ?? null,
      errorInfo: e?.errorInfo ?? null,
    });
  }
});

// GET /api/fcm/diagnostics — admin: FCM token health overview
router.get("/diagnostics", authenticate, A, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [
      [{ totalUsers }],
      [{ activeTokens }],
      tokensByRoleRows,
      tokensByPlatformRows,
      lastBroadcastRows,
    ] = await Promise.all([
      db.select({ totalUsers: count() }).from(users),
      db.select({ activeTokens: count() }).from(fcmTokens).where(eq(fcmTokens.isActive, true)),

      db.select({ role: fcmTokens.role, cnt: count() })
        .from(fcmTokens)
        .where(eq(fcmTokens.isActive, true))
        .groupBy(fcmTokens.role),

      db.select({ platform: fcmTokens.platform, cnt: count() })
        .from(fcmTokens)
        .where(eq(fcmTokens.isActive, true))
        .groupBy(fcmTokens.platform),

      db.select().from(adminBroadcasts).orderBy(desc(adminBroadcasts.createdAt)).limit(1),
    ]);

    let allTimePushSent = 0;
    let allTimePushFailed = 0;
    try {
      const [totals] = await db.select({
        allTimeSent:   sum(adminBroadcasts.pushSent),
        allTimeFailed: sum(adminBroadcasts.pushFailed),
      }).from(adminBroadcasts);
      allTimePushSent   = Number(totals?.allTimeSent   ?? 0);
      allTimePushFailed = Number(totals?.allTimeFailed ?? 0);
    } catch { /* columns may be missing in pre-migrated prod */ }

    const tokensByRole: Record<string, number> = {};
    for (const row of tokensByRoleRows) tokensByRole[row.role] = Number(row.cnt);

    const tokensByPlatform: Record<string, number> = {};
    for (const row of tokensByPlatformRows) tokensByPlatform[row.platform] = Number(row.cnt);

    const lastBroadcast = lastBroadcastRows[0] ?? null;

    res.json({
      success: true,
      totalUsers:     Number(totalUsers),
      activeTokens:   Number(activeTokens),
      tokensByRole,
      tokensByPlatform,
      lastBroadcast: lastBroadcast ? {
        title:      lastBroadcast.title,
        pushSent:   lastBroadcast.pushSent ?? 0,
        pushFailed: lastBroadcast.pushFailed ?? 0,
        sentCount:  lastBroadcast.sentCount,
        createdAt:  lastBroadcast.createdAt,
      } : null,
      allTimePushSent,
      allTimePushFailed,
    });
  } catch (err) {
    logger.error({ err }, "[FCM] diagnostics error");
    res.status(500).json({ success: false, message: "Failed to load FCM diagnostics" });
  }
});

export default router;
