import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";

export const adminBroadcasts = pgTable("admin_broadcasts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull(),
  message: text("message").notNull(),
  targetAudience: text("target_audience").notNull(),
  targetUserId: text("target_user_id"),
  sentCount: integer("sent_count").notNull().default(0),
  pushSent: integer("push_sent").notNull().default(0),
  pushFailed: integer("push_failed").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type AdminBroadcast = typeof adminBroadcasts.$inferSelect;
export type InsertAdminBroadcast = typeof adminBroadcasts.$inferInsert;
