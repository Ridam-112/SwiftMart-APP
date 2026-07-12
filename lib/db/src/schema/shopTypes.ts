import { pgTable, text, timestamp, boolean, doublePrecision } from "drizzle-orm/pg-core";

export const shopTypes = pgTable("shop_types", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  commissionRate: doublePrecision("commission_rate").default(5),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type ShopType = typeof shopTypes.$inferSelect;
export type InsertShopType = typeof shopTypes.$inferInsert;
