import { pgTable, text, timestamp, boolean, doublePrecision, jsonb } from "drizzle-orm/pg-core";

export const categories = pgTable("categories", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  shopTypes: jsonb("shop_types").notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  commissionRate: doublePrecision("commission_rate"),
  emoji: text("emoji"),
  color: text("color"),
  subcategories: jsonb("subcategories").notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Category = typeof categories.$inferSelect;
export type InsertCategory = typeof categories.$inferInsert;
