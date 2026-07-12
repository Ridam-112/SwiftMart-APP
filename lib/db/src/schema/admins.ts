import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";

export const admins = pgTable("admins", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  phone: text("phone").notNull().unique(),
  name: text("name").notNull(),
  role: text("role").notNull().default("admin"),
  status: text("status").notNull().default("active"),
  addedBy: text("added_by"),
  activityLog: jsonb("activity_log").notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Admin = typeof admins.$inferSelect;
export type InsertAdmin = typeof admins.$inferInsert;
