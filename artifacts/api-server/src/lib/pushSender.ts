/**
 * Shared push-notification sender.
 * Routes automatically:
 *   FCM tokens  → Firebase Admin SDK (direct FCM delivery)
 *   Expo tokens → Expo Push Service (which relays through FCM / APNs)
 */
import { Expo, type ExpoPushMessage } from "expo-server-sdk";
import { getFirebaseMessaging, isFcmToken } from "./firebase";
import { logger } from "./logger";

/**
 * Subscribe / unsubscribe an FCM token to a Firebase topic.
 * Topics let Firebase Console send to groups of devices without
 * the server needing to know every individual token.
 * No-ops silently if Firebase Admin is not configured.
 */
export async function subscribeToTopics(
  token: string,
  topics: string[]
): Promise<void> {
  if (!isFcmToken(token)) return; // Expo tokens don't support topics
  const messaging = getFirebaseMessaging();
  if (!messaging) return;
  try {
    await Promise.all(
      topics.map((topic) => messaging.subscribeToTopic([token], topic))
    );
    logger.info({ token: token.slice(0, 20) + "…", topics }, "Subscribed to FCM topics");
  } catch (err) {
    logger.warn({ err }, "FCM topic subscription failed (non-fatal)");
  }
}

export async function unsubscribeFromTopics(
  token: string,
  topics: string[]
): Promise<void> {
  if (!isFcmToken(token)) return;
  const messaging = getFirebaseMessaging();
  if (!messaging) return;
  try {
    await Promise.all(
      topics.map((topic) => messaging.unsubscribeFromTopic([token], topic))
    );
  } catch (err) {
    logger.warn({ err }, "FCM topic unsubscription failed (non-fatal)");
  }
}

const expo = new Expo();

export interface SendResult {
  ok: boolean;
  error?: string;
}

export async function sendPushToToken(
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<SendResult> {
  if (isFcmToken(token)) {
    // ── Firebase Admin path ────────────────────────────────────────────────
    const messaging = getFirebaseMessaging();
    if (!messaging) {
      return { ok: false, error: "Firebase Admin not configured" };
    }
    try {
      await messaging.send({
        token,
        notification: { title, body },
        data: data ?? {},
        android: {
          priority: "high",
          notification: {
            channelId: "default",
            sound: "default",
            color: "#16A34A",
          },
        },
        apns: {
          payload: { aps: { sound: "default", badge: 1 } },
        },
      });
      return { ok: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  } else {
    // ── Expo push path ─────────────────────────────────────────────────────
    if (!Expo.isExpoPushToken(token)) {
      return { ok: false, error: "Unrecognised token format" };
    }
    try {
      const messages: ExpoPushMessage[] = [
        {
          to: token,
          sound: "default",
          title,
          body,
          data,
          priority: "high",
          channelId: "default",
        },
      ];
      const [ticket] = await expo.sendPushNotificationsAsync(messages);
      if (ticket.status === "error") {
        return { ok: false, error: ticket.message };
      }
      return { ok: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  }
}

/**
 * Send to many tokens, chunking Expo tokens automatically.
 * FCM tokens are sent individually (Firebase Admin doesn't batch the same way).
 */
export async function sendPushToMany(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<{ sent: number; failed: number }> {
  const fcmTokens = tokens.filter(isFcmToken);
  const expoTokens = tokens.filter((t) => !isFcmToken(t));

  let failed = 0;

  // FCM — parallel sends
  if (fcmTokens.length > 0) {
    const results = await Promise.all(
      fcmTokens.map((t) => sendPushToToken(t, title, body, data))
    );
    failed += results.filter((r) => !r.ok).length;
    if (failed > 0) {
      logger.warn({ failed, total: fcmTokens.length }, "Some FCM sends failed");
    }
  }

  // Expo — chunked sends (max 100 per request)
  if (expoTokens.length > 0) {
    const validExpo = expoTokens.filter((t) => Expo.isExpoPushToken(t));
    const messages: ExpoPushMessage[] = validExpo.map((t) => ({
      to: t,
      sound: "default",
      title,
      body,
      data,
      priority: "high",
      channelId: "default",
    }));
    for (const chunk of expo.chunkPushNotifications(messages)) {
      try {
        const tickets = await expo.sendPushNotificationsAsync(chunk);
        const chunkFailed = tickets.filter((tk) => tk.status === "error").length;
        failed += chunkFailed;
        if (chunkFailed > 0) {
          logger.warn({ chunkFailed }, "Some Expo push sends failed");
        }
      } catch (err) {
        logger.error({ err }, "Expo chunk send failed");
        failed += chunk.length;
      }
    }
  }

  const sent = tokens.length - failed;
  return { sent, failed };
}
