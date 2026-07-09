import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Single-row cursor tracking the last website admin_broadcasts.created_at
// timestamp we've already delivered as a push notification, so a poller
// restart never re-sends history and never misses a broadcast.
// id is always the fixed string "cursor" — this table only ever has one row.
export const broadcastSyncStateTable = pgTable("broadcast_sync_state", {
  id: text("id").primaryKey(),
  lastSyncedAt: timestamp("last_synced_at").notNull(),
  lastBroadcastId: text("last_broadcast_id"),
});

export type BroadcastSyncState = typeof broadcastSyncStateTable.$inferSelect;
