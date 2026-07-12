import { pgTable, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";

export const heroBanners = pgTable("hero_banners", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  imageUrl: text("image_url").notNull(),
  title: text("title"),
  subtitle: text("subtitle"),
  buttonText: text("button_text"),
  redirectType: text("redirect_type"),
  redirectValue: text("redirect_value"),
  isActive: boolean("is_active").notNull().default(true),
  displayOrder: integer("display_order").notNull().default(0),
  views: integer("views").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type HeroBanner = typeof heroBanners.$inferSelect;
export type InsertHeroBanner = typeof heroBanners.$inferInsert;
