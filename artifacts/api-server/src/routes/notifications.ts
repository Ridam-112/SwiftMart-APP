import { Router } from "express";
import { randomUUID } from "node:crypto";
import { Expo } from "expo-server-sdk";
import { and, eq } from "drizzle-orm";
import { db, pushTokensTable } from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { logger } from "../lib/logger";
import { isFcmToken } from "../lib/firebase";
import { sendPushToToken, subscribeToTopics, unsubscribeFromTopics } from "../lib/pushSender";

const router = Router();

// In-memory rate limit for the test-send endpoint (5 per user per minute)
const testSendHits = new Map<string, number[]>();
const TEST_SEND_LIMIT = 5;
const TEST_SEND_WINDOW_MS = 60_000;
function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const hits = (testSendHits.get(userId) ?? []).filter(
    (t) => now - t < TEST_SEND_WINDOW_MS
  );
  hits.push(now);
  testSendHits.set(userId, hits);
  return hits.length > TEST_SEND_LIMIT;
}

/** Accepts both Expo push tokens and raw FCM registration tokens. */
function isValidToken(token: string): boolean {
  // Expo token format: ExponentPushToken[xxxxxxxx]
  if (token.startsWith("ExponentPushToken[") && token.endsWith("]")) return true;
  // FCM tokens are long alphanumeric strings (typically 140-200 chars)
  if (token.length >= 50) return true;
  return false;
}

/**
 * POST /api/notifications/register-token
 * Saves (or updates) the push token for the signed-in user's device.
 * Accepts both Expo push tokens (ExponentPushToken[...]) and raw FCM tokens.
 */
router.post("/register-token", requireAuth, async (req, res): Promise<void> => {
  const { token, platform } = req.body as { token?: string; platform?: string };

  if (!token || !isValidToken(token)) {
    res.status(400).json({ success: false, message: "Invalid push token" });
    return;
  }
  if (!platform || !["ios", "android", "web"].includes(platform)) {
    res.status(400).json({ success: false, message: "Invalid platform" });
    return;
  }

  try {
    const [existing] = await db
      .select()
      .from(pushTokensTable)
      .where(eq(pushTokensTable.token, token));

    if (existing && existing.userId !== req.userId) {
      res
        .status(409)
        .json({ success: false, message: "Token registered to a different account" });
      return;
    }

    await db
      .insert(pushTokensTable)
      .values({ id: randomUUID(), userId: req.userId!, token, platform })
      .onConflictDoUpdate({
        target: pushTokensTable.token,
        set: { platform, updatedAt: new Date() },
      });

    const tokenType = isFcmToken(token) ? "fcm" : "expo";

    // Subscribe FCM token to topics so Firebase Console can broadcast
    // to all users or role-specific groups without needing individual tokens.
    const topics = ["all_users"];
    if (req.userRole) topics.push(req.userRole); // e.g. "customer", "vendor", "rider"
    await subscribeToTopics(token, topics);

    logger.info({ userId: req.userId, platform, tokenType, topics }, "Push token registered");
    res.json({ success: true, tokenType, topics });
  } catch (err) {
    logger.error({ err }, "Failed to register push token");
    res.status(500).json({ success: false, message: "Could not register push token" });
  }
});

/**
 * POST /api/notifications/unregister-token
 * Removes a device's push token on logout.
 */
router.post(
  "/unregister-token",
  requireAuth,
  async (req, res): Promise<void> => {
    const { token } = req.body as { token?: string };
    if (!token) {
      res.status(400).json({ success: false, message: "token is required" });
      return;
    }
    try {
      await db
        .delete(pushTokensTable)
        .where(
          and(
            eq(pushTokensTable.token, token),
            eq(pushTokensTable.userId, req.userId!)
          )
        );
      // Best-effort topic unsubscription on logout
      await unsubscribeFromTopics(token, ["all_users", "customer", "vendor", "rider"]);
      res.json({ success: true });
    } catch (err) {
      logger.error({ err }, "Failed to unregister push token");
      res.status(500).json({ success: false, message: "Could not unregister push token" });
    }
  }
);

/**
 * POST /api/notifications/send-test
 * Sends a test notification to every device registered for the signed-in user.
 * Routes automatically: FCM tokens → Firebase Admin, Expo tokens → Expo SDK.
 */
router.post(
  "/send-test",
  requireAuth,
  async (req, res): Promise<void> => {
    if (isRateLimited(req.userId!)) {
      res.status(429).json({ success: false, message: "Rate limit exceeded — try again in a minute" });
      return;
    }

    try {
      const rows = await db
        .select()
        .from(pushTokensTable)
        .where(eq(pushTokensTable.userId, req.userId!));

      if (rows.length === 0) {
        res
          .status(404)
          .json({ success: false, message: "No registered devices for this user" });
        return;
      }

      const { title, body } = req.body as { title?: string; body?: string };
      const msgTitle = title || "SwiftMart";
      const msgBody  = body  || "Test notification from SwiftMart 🛒";

      const results = await Promise.all(
        rows.map((row: typeof pushTokensTable.$inferSelect) =>
          sendPushToToken(row.token, msgTitle, msgBody)
        )
      );

      const failed = results.filter((r: { ok: boolean }) => !r.ok).length;
      logger.info({ sent: results.length, failed }, "Test push sent");

      res.json({ success: true, sent: results.length, failed, details: results });
    } catch (err) {
      logger.error({ err }, "Failed to send test push");
      res.status(500).json({ success: false, message: "Could not send push notification" });
    }
  }
);

export default router;
