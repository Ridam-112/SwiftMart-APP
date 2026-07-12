import { pgTable, text, timestamp, boolean, doublePrecision, integer, jsonb, index } from "drizzle-orm/pg-core";
import { shops } from "./shops";

export const products = pgTable("products", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  description: text("description"),
  price: doublePrecision("price").notNull().default(0),
  discountedPrice: doublePrecision("discounted_price"),
  category: text("category"),
  subcategory: text("subcategory"),
  shopId: text("shop_id").notNull().references(() => shops.id, { onDelete: "cascade" }),
  images: jsonb("images").notNull().default([]),
  stock: integer("stock").notNull().default(0),
  sku: text("sku"),
  unit: text("unit"),
  rating: doublePrecision("rating").default(0),
  commissionRate: doublePrecision("commission_rate"),
  status: text("status").notNull().default("pending"),
  rejectionReason: text("rejection_reason"),
  trending: boolean("trending").default(false),
  colors: jsonb("colors"),
  sizes: jsonb("sizes"),
  colorImages: jsonb("color_images"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [
  index("products_shop_id_idx").on(t.shopId),
  index("products_category_idx").on(t.category),
  index("products_status_idx").on(t.status),
  index("products_shop_id_status_idx").on(t.shopId, t.status),
]);

export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;
