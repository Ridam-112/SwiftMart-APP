import { db, notifications, fcmTokens } from "@workspace/db";
import { eq, count, asc, inArray, and } from "drizzle-orm";
import { getMessagingInstance } from "../lib/firebase-admin.js";
import { logger } from "../lib/logger.js";

const NOTIFICATION_LIMIT = 10;

export type NotificationPayload = {
  type: "order_update" | "shop_approval" | "delivery_update" | "coupon" | "promo" | "system";
  title: string;
  message: string;
  data?: Record<string, unknown>;
};

const APP_URL = (process.env["APP_URL"] ?? "").replace(/\/+$/, "");

// ─── FCM helpers ─────────────────────────────────────────────────────────────

/**
 * Sends an FCM push notification to a single user's active devices.
 */
async function sendFcm(userId: string, payload: NotificationPayload): Promise<void> {
  try {
    const tokens = await db
      .select({ token: fcmTokens.token, id: fcmTokens.id })
      .from(fcmTokens)
      .where(and(eq(fcmTokens.userId, userId), eq(fcmTokens.isActive, true)));

    if (tokens.length === 0) return;

    const messaging = getMessagingInstance();
    if (!messaging) return;

    const rawUrl = String(payload.data?.url ?? "/notifications");
    // fcmOptions.link must be absolute — prepend APP_URL if the url is relative
    const targetUrl = rawUrl.startsWith("http") ? rawUrl : `${APP_URL}${rawUrl}`;
    const iconUrl = APP_URL ? `${APP_URL}/logo.png` : undefined;

    const { successCount, failureCount, responses } = await messaging.sendEachForMulticast({
      tokens: tokens.map(t => t.token),
      notification: {
        title: payload.title,
        body:  payload.message,
        ...(iconUrl ? { imageUrl: iconUrl } : {}),
      },
      data: {
        type:     payload.type,
        url:      targetUrl,
        title:    payload.title,
        body:     payload.message,
      },
      android: {
        priority: "high",
        notification: {
          color: "#6366f1",
          sound: "default",
          tag: payload.type,
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: 1,
          },
        },
      },
      webpush: {
        notification: {
          icon:  iconUrl,
          badge: iconUrl,
          requireInteraction: false,
          tag: payload.type,
        },
        ...(targetUrl.startsWith("http") ? { fcmOptions: { link: targetUrl } } : {}),
      },
    });

    logger.info({ userId, successCount, failureCount }, "FCM send complete");

    // Deactivate tokens that Firebase says are invalid/expired
    const toDeactivate: string[] = [];
    for (let i = 0; i < responses.length; i++) {
      const resp = responses[i];
      if (!resp || resp.success) continue;
      const code = resp.error?.code ?? "";
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token" ||
        code === "messaging/invalid-argument"
      ) {
        const tokenId = tokens[i]?.id;
        if (tokenId) toDeactivate.push(tokenId);
      }
    }
    if (toDeactivate.length > 0) {
      await db.update(fcmTokens).set({ isActive: false }).where(inArray(fcmTokens.id, toDeactivate));
    }
  } catch (err) {
    logger.error({ err }, "FCM sendFcm top-level error");
  }
}

/**
 * Sends FCM push notifications to multiple users' active devices.
 * Returns { sent, failed } delivery counts.  Used by admin broadcasts.
 */
export async function sendFcmToUsers(
  userIds: string[],
  payload: NotificationPayload
): Promise<{ sent: number; failed: number }> {
  if (userIds.length === 0) return { sent: 0, failed: 0 };

  try {
    const rows = await db
      .select({ token: fcmTokens.token, id: fcmTokens.id })
      .from(fcmTokens)
      .where(and(inArray(fcmTokens.userId, userIds), eq(fcmTokens.isActive, true)));

    if (rows.length === 0) return { sent: 0, failed: 0 };

    const messaging = getMessagingInstance();
    if (!messaging) return { sent: 0, failed: 0 };

    const targetUrl = String(payload.data?.url ?? "/notifications");
    const iconUrl = APP_URL ? `${APP_URL}/logo.png` : undefined;

    // Firebase multicast supports max 500 tokens per call — batch if needed
    const BATCH_SIZE = 500;
    let totalSent = 0;
    let totalFailed = 0;
    const toDeactivate: string[] = [];

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { responses } = await messaging.sendEachForMulticast({
        tokens: batch.map(t => t.token),
        notification: {
          title: payload.title,
          body:  payload.message,
          ...(iconUrl ? { imageUrl: iconUrl } : {}),
        },
        data: {
          type:  payload.type,
          url:   targetUrl,
          title: payload.title,
          body:  payload.message,
        },
        webpush: {
          notification: {
            icon:  iconUrl,
            badge: iconUrl,
            requireInteraction: false,
            tag: payload.type,
          },
          fcmOptions: { link: targetUrl },
        },
      });

      for (let j = 0; j < responses.length; j++) {
        const resp = responses[j];
        if (!resp) continue;
        if (resp.success) {
          totalSent++;
        } else {
          totalFailed++;
          const code = resp.error?.code ?? "";
          if (
            code === "messaging/registration-token-not-registered" ||
            code === "messaging/invalid-registration-token" ||
            code === "messaging/invalid-argument"
          ) {
            const tokenId = batch[j]?.id;
            if (tokenId) toDeactivate.push(tokenId);
          }
        }
      }
    }

    if (toDeactivate.length > 0) {
      await db.update(fcmTokens).set({ isActive: false }).where(inArray(fcmTokens.id, toDeactivate));
    }

    logger.info({ totalSent, totalFailed, total: rows.length }, "FCM broadcast complete");
    return { sent: totalSent, failed: totalFailed };
  } catch (err) {
    logger.error({ err }, "FCM sendFcmToUsers top-level error");
    return { sent: 0, failed: 0 };
  }
}

// Keep old export name so existing callers (notifications.ts broadcast route) don't break
export const sendPushToUsers = sendFcmToUsers;

// ─── Notification creation ────────────────────────────────────────────────────

export async function createNotificationLimited(
  userId: string,
  payload: NotificationPayload,
  opts: { noPush?: boolean } = {}
): Promise<void> {
  await db.insert(notifications).values({ userId, ...payload });

  await trimNotificationsForUser(userId);

  if (!opts.noPush) {
    void sendFcm(userId, payload);
  }
}

/**
 * Enforces the per-user notification cap (NOTIFICATION_LIMIT = 10).
 * Deletion priority:
 *   1. Oldest READ notifications first — user has already seen them, safest to drop.
 *   2. If still over cap, oldest overall (including unread) — limit must be enforced.
 * The most recent notifications are always preserved.
 * Safe to call independently for bulk cleanup of existing users.
 */
export async function trimNotificationsForUser(userId: string): Promise<void> {
  const [{ cnt }] = await db
    .select({ cnt: count() })
    .from(notifications)
    .where(eq(notifications.userId, userId));

  const total = Number(cnt);
  if (total <= NOTIFICATION_LIMIT) return;

  let stillNeedToDelete = total - NOTIFICATION_LIMIT;
  const toDeleteIds: string[] = [];

  // Pass 1: oldest READ notifications (already seen — safest to prune)
  const readOld = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, true)))
    .orderBy(asc(notifications.createdAt))
    .limit(stillNeedToDelete);

  for (const r of readOld) toDeleteIds.push(r.id);
  stillNeedToDelete -= readOld.length;

  // Pass 2: oldest overall (unread) — only if still over cap
  if (stillNeedToDelete > 0) {
    const anyOld = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(asc(notifications.createdAt))
      .limit(stillNeedToDelete + toDeleteIds.length);

    const alreadySelected = new Set(toDeleteIds);
    for (const r of anyOld) {
      if (!alreadySelected.has(r.id) && stillNeedToDelete > 0) {
        toDeleteIds.push(r.id);
        stillNeedToDelete--;
      }
    }
  }

  if (toDeleteIds.length > 0) {
    await db.delete(notifications).where(inArray(notifications.id, toDeleteIds));
  }
}
