import { pgTable, text, timestamp, boolean, doublePrecision, integer } from "drizzle-orm/pg-core";

export const coupons = pgTable("coupons", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  code: text("code").notNull().unique(),
  type: text("type").notNull().default("percentage"),
  value: doublePrecision("value").notNull().default(0),
  minimumOrder: doublePrecision("minimum_order").notNull().default(0),
  maximumDiscount: doublePrecision("maximum_discount"),
  expiryDate: timestamp("expiry_date").notNull(),
  usageLimit: integer("usage_limit").notNull().default(0),
  perUserLimit: integer("per_user_limit").notNull().default(0),
  usedCount: integer("used_count").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  appliesTo: text("applies_to").notNull().default("all"),
  targetId: text("target_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Coupon = typeof coupons.$inferSelect;
export type InsertCoupon = typeof coupons.$inferInsert;
