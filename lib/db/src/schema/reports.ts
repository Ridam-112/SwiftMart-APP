import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const reports = pgTable("reports", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  type: text("type").notNull(),
  targetId: text("target_id").notNull(),
  targetName: text("target_name").notNull().default(""),
  reportedBy: text("reported_by").notNull(),
  reporterPhone: text("reporter_phone").notNull().default(""),
  reason: text("reason").notNull(),
  description: text("description"),
  status: text("status").notNull().default("open"),
  resolvedBy: text("resolved_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Report = typeof reports.$inferSelect;
export type InsertReport = typeof reports.$inferInsert;
