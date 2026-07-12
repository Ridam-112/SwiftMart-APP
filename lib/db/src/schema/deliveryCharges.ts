import { pgTable, text, timestamp, doublePrecision } from "drizzle-orm/pg-core";

export const deliveryChargeRules = pgTable("delivery_charge_rules", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  fromPincode: text("from_pincode").notNull(),
  toPincode: text("to_pincode").notNull(),
  baseCharge: doublePrecision("base_charge").notNull().default(0),
  rainSurcharge: doublePrecision("rain_surcharge").notNull().default(0),
  label: text("label"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const deliverySettings = pgTable("delivery_settings", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type DeliveryChargeRule = typeof deliveryChargeRules.$inferSelect;
export type InsertDeliveryChargeRule = typeof deliveryChargeRules.$inferInsert;
export type DeliverySetting = typeof deliverySettings.$inferSelect;
