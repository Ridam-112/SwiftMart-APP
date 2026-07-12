import { pgTable, text, timestamp, jsonb, integer, index } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull().default("User"),

  // phone is now nullable — email-first auth; new users complete phone in /complete-profile
  phone: text("phone"),

  email: text("email"),
  googleId: text("google_id"),

  // Links to neon_auth.user.id (Better Auth UUID, stored as text)
  authUserId: text("auth_user_id"),

  role: text("role").notNull().default("customer"),
  status: text("status").notNull().default("active"),
  vendorStatus: text("vendor_status").notNull().default("none"),
  pincode: text("pincode"),
  addresses: jsonb("addresses").notNull().default([]),
  tokenVersion: integer("token_version").notNull().default(1),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),

  // Local password hash — only used for legacy phone-password users (nullable)
  passwordHash: text("password_hash"),
  authProvider: text("auth_provider").notNull().default("email"),
  profilePhoto: text("profile_photo"),

  // Legacy password-reset fields (kept for backward compat, not used in email flow)
  passwordResetTokenHash: text("password_reset_token_hash"),
  passwordResetExpires: timestamp("password_reset_expires"),
}, (t) => [
  index("users_email_idx").on(t.email),
  index("users_google_id_idx").on(t.googleId),
  index("users_role_idx").on(t.role),
  index("users_auth_user_id_idx").on(t.authUserId),
]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
