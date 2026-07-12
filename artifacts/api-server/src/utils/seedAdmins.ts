import { db, admins, users } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const SUPER_ADMIN_PHONES = (process.env["SUPER_ADMIN_PHONES"] ?? "6296118949,7602584238")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);

export const SUPER_ADMIN_EMAIL_SET = new Set(
  (process.env["SUPER_ADMIN_EMAILS"] ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

export function isSuperAdminEmail(email: string): boolean {
  return SUPER_ADMIN_EMAIL_SET.has(email.trim().toLowerCase());
}

export async function seedSuperAdmins(): Promise<void> {
  // ── Phone-based super admins (legacy OTP accounts) ──────────────────────────
  for (const phone of SUPER_ADMIN_PHONES) {
    const [existingAdmin] = await db.select().from(admins).where(eq(admins.phone, phone)).limit(1);
    if (!existingAdmin) {
      await db.insert(admins).values({ phone, name: "Super Admin", role: "super_admin", status: "active" });
      logger.info({ phone }, "Super admin seeded in admins table");
    }

    const [existingUser] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
    if (!existingUser) {
      await db.insert(users).values({ phone, name: "Super Admin", role: "super_admin", status: "active" });
      logger.info({ phone }, "Super admin seeded in users table");
    } else if (existingUser.role !== "super_admin") {
      await db.update(users).set({ role: "super_admin" }).where(eq(users.phone, phone));
      logger.info({ phone }, "Promoted phone-based user to super_admin");
    }
  }

  // ── Email-based super admins (current email+password auth) ──────────────────
  // If SUPER_ADMIN_EMAILS is set, any existing user with that email is promoted
  // immediately. New sign-ups with those emails are promoted at signup time
  // (see /auth/email-signup and /auth/email-login in auth.ts).
  for (const email of SUPER_ADMIN_EMAIL_SET) {
    const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing) {
      if (existing.role !== "super_admin") {
        await db.update(users).set({ role: "super_admin" }).where(eq(users.id, existing.id));
        logger.info({ email }, "Promoted existing email user to super_admin");
      }
    } else {
      logger.info({ email }, "SUPER_ADMIN_EMAILS: no account yet — will promote on first sign-up");
    }
  }
}
