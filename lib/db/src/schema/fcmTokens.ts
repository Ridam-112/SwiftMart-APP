import { pgTable, text, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { users } from "./users";

export const fcmTokens = pgTable("fcm_tokens", {
  id:          text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId:      text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token:       text("token").notNull().unique(),
  platform:    text("platform").notNull().default("web"),
  role:        text("role").notNull().default("customer"),
  userAgent:   text("user_agent"),
  isActive:    boolean("is_active").notNull().default(true),
  lastSeenAt:  timestamp("last_seen_at").notNull().defaultNow(),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
  updatedAt:   timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("fcm_tokens_user_id_idx").on(t.userId),
  index("fcm_tokens_user_id_role_active_idx").on(t.userId, t.role, t.isActive),
]);

export type FcmToken = typeof fcmTokens.$inferSelect;
export type InsertFcmToken = typeof fcmTokens.$inferInsert;
