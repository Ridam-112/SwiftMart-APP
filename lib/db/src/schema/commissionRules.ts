import { pgTable, text, timestamp, boolean, doublePrecision } from "drizzle-orm/pg-core";

export const commissionRules = pgTable("commission_rules", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  level: text("level").notNull(),
  type: text("type").notNull().default("percentage"),
  targetId: text("target_id"),
  targetName: text("target_name"),
  rate: doublePrecision("rate").notNull().default(5),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type CommissionRule = typeof commissionRules.$inferSelect;
export type InsertCommissionRule = typeof commissionRules.$inferInsert;
