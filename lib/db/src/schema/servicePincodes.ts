import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const servicePincodes = pgTable("service_pincodes", {
  pincode: text("pincode").primaryKey(),
  area:    text("area").notNull(),
  state:   text("state").notNull().default("West Bengal"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type ServicePincode    = typeof servicePincodes.$inferSelect;
export type InsertServicePincode = typeof servicePincodes.$inferInsert;
