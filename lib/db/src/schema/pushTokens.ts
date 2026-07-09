import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Stores Expo push tokens for the SwiftMart mobile app so the backend can
// send remote push notifications (order updates, promos, delivery status)
// that show up in the OS notification panel, the same way Flipkart does.
// userId references the SwiftMart website's own user id (a string, since
// that user store lives in the separate Neon database, not this one).
export const pushTokensTable = pgTable(
  "push_tokens",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    token: text("token").notNull(),
    platform: text("platform").notNull(), // 'ios' | 'android' | 'web'
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("push_tokens_token_idx").on(table.token)],
);

export const insertPushTokenSchema = createInsertSchema(pushTokensTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPushToken = z.infer<typeof insertPushTokenSchema>;
export type PushToken = typeof pushTokensTable.$inferSelect;
