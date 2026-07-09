import { eq } from "drizzle-orm";
import { db, pushTokensTable, broadcastSyncStateTable } from "@workspace/db";
import { neonPool } from "./neonDb";
import { logger } from "./logger";
import { sendPushToMany } from "./pushSender";

const CURSOR_ROW_ID = "cursor";
const POLL_INTERVAL_MS = 15_000;

type AdminBroadcastRow = {
  id: string;
  title: string;
  message: string;
  target_audience: string;
  target_user_id: string | null;
  created_at: Date;
};

async function getCursor(): Promise<{ lastSyncedAt: Date; lastBroadcastId: string | null }> {
  const [row] = await db
    .select()
    .from(broadcastSyncStateTable)
    .where(eq(broadcastSyncStateTable.id, CURSOR_ROW_ID));
  if (row) return { lastSyncedAt: row.lastSyncedAt, lastBroadcastId: row.lastBroadcastId };

  // First run ever: start from "now" so we never blast years of historical
  // website broadcasts to freshly-registered app devices.
  const now = new Date();
  await db
    .insert(broadcastSyncStateTable)
    .values({ id: CURSOR_ROW_ID, lastSyncedAt: now, lastBroadcastId: null });
  return { lastSyncedAt: now, lastBroadcastId: null };
}

async function setCursor(lastSyncedAt: Date, lastBroadcastId: string): Promise<void> {
  await db
    .insert(broadcastSyncStateTable)
    .values({ id: CURSOR_ROW_ID, lastSyncedAt, lastBroadcastId })
    .onConflictDoUpdate({
      target: broadcastSyncStateTable.id,
      set: { lastSyncedAt, lastBroadcastId },
    });
}

async function pushToTokens(rows: { token: string }[], title: string, body: string): Promise<void> {
  if (rows.length === 0) return;
  const tokens = rows.map((r) => r.token);
  const { sent, failed } = await sendPushToMany(tokens, title, body);
  if (failed > 0) {
    logger.warn({ sent, failed, total: tokens.length }, "Some broadcast pushes failed to deliver");
  }
}

/**
 * Delivers one broadcast row to the right set of devices: "all" audience
 * goes to every registered device, a specific target_user_id only goes to
 * that website user's devices (matched by the same user id our /register-token
 * endpoint stores, since both come from swiftmart.space auth).
 */
async function deliverBroadcast(row: AdminBroadcastRow): Promise<void> {
  const tokens =
    row.target_audience === "all" || !row.target_user_id
      ? await db.select({ token: pushTokensTable.token }).from(pushTokensTable)
      : await db
          .select({ token: pushTokensTable.token })
          .from(pushTokensTable)
          .where(eq(pushTokensTable.userId, row.target_user_id));

  await pushToTokens(tokens, row.title, row.message);
  logger.info(
    { broadcastId: row.id, devices: tokens.length },
    "Delivered website admin broadcast as push notification",
  );
}

async function pollOnce(): Promise<void> {
  if (!neonPool) return;
  const { lastSyncedAt, lastBroadcastId } = await getCursor();
  // Tie-break on id when two broadcasts share the same created_at timestamp,
  // so a row is never skipped or re-sent purely because of a timestamp tie.
  const { rows } = await neonPool.query<AdminBroadcastRow>(
    `SELECT id, title, message, target_audience, target_user_id, created_at
     FROM admin_broadcasts
     WHERE created_at > $1 OR (created_at = $1 AND id > $2)
     ORDER BY created_at ASC, id ASC`,
    [lastSyncedAt, lastBroadcastId ?? ""],
  );
  if (rows.length === 0) return;

  for (const row of rows) {
    try {
      await deliverBroadcast(row);
      // Advance the cursor per-row, only past successful deliveries — a
      // transient failure (Expo API hiccup, DB blip) is retried on the next
      // poll instead of being silently skipped forever.
      await setCursor(row.created_at, row.id);
    } catch (err) {
      logger.error({ err, broadcastId: row.id }, "Failed to deliver broadcast push, will retry next poll");
      break;
    }
  }
}

/**
 * Starts polling the website's admin_broadcasts table (in its Neon DB) so
 * that whenever the website admin panel sends a broadcast notification, this
 * app picks it up within POLL_INTERVAL_MS and pushes it to every registered
 * device's OS notification panel — no changes needed on the website side.
 */
export function startBroadcastSync(): void {
  // Single-flight guard: skip starting a new poll while one is still running,
  // so a slow poll (large token set, flaky Expo/DB call) can never overlap
  // with the next tick and double-send a broadcast.
  let isPolling = false;
  const tick = () => {
    if (isPolling) return;
    isPolling = true;
    pollOnce()
      .catch((err) => logger.error({ err }, "Broadcast sync poll failed"))
      .finally(() => {
        isPolling = false;
      });
  };
  tick();
  setInterval(tick, POLL_INTERVAL_MS);
  logger.info({ intervalMs: POLL_INTERVAL_MS }, "Started website broadcast → push notification sync");
}
