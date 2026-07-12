import { Router, type Response } from "express";
import { createHash, randomBytes } from "node:crypto";
import { db, users } from "@workspace/db";
import { eq, and, ilike, or, count, desc } from "drizzle-orm";
import { authenticate, requireRole, type AuthRequest } from "../../middlewares/auth.js";
import { validateUuidParams } from "../../middlewares/validateUuid.js";
import { mi } from "../../utils/mapId.js";
import { sendAccountSetupEmail, isEmailConfigured } from "../../lib/email.js";
import { logger } from "../../lib/logger.js";

const router = Router();
const A = requireRole("admin", "super_admin");

const SETUP_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Strip sensitive columns and add computed hasPassword field before sending to clients. */
function safeUser(u: typeof users.$inferSelect) {
  const { passwordHash, passwordResetTokenHash, passwordResetExpires, ...rest } = u;
  return { ...mi(rest as Parameters<typeof mi>[0]), hasPassword: !!passwordHash };
}

// GET /api/users
router.get("/", authenticate, A, async (req: AuthRequest, res: Response): Promise<void> => {
  const { role, status, search, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pg = parseInt(page), lm = parseInt(limit);
  const conditions = [];
  if (role) conditions.push(eq(users.role, role));
  if (status) conditions.push(eq(users.status, status));
  if (search) conditions.push(or(ilike(users.name, `%${search}%`), ilike(users.phone, `%${search}%`))!);
  const where = conditions.length ? and(...conditions) : undefined;
  const skip = (pg - 1) * lm;
  const [result, [{ total }]] = await Promise.all([
    db.select().from(users).where(where).orderBy(desc(users.createdAt)).offset(skip).limit(lm),
    db.select({ total: count() }).from(users).where(where),
  ]);
  res.json({ success: true, users: result.map(safeUser), total: Number(total), page: pg, pages: Math.ceil(Number(total) / lm) });
});

// PATCH /api/users/:id/ban
router.patch("/:id/ban", authenticate, A, async (req: AuthRequest, res: Response): Promise<void> => {
  const [user] = await db.update(users).set({ status: "banned" }).where(eq(users.id, req.params["id"] as string)).returning();
  if (!user) { res.status(404).json({ success: false, message: "User not found" }); return; }
  res.json({ success: true, user: safeUser(user) });
});

// PATCH /api/users/:id/unban
router.patch("/:id/unban", authenticate, A, async (req: AuthRequest, res: Response): Promise<void> => {
  const [user] = await db.update(users).set({ status: "active" }).where(eq(users.id, req.params["id"] as string)).returning();
  if (!user) { res.status(404).json({ success: false, message: "User not found" }); return; }
  res.json({ success: true, user: safeUser(user) });
});

// POST /api/users/:id/send-setup-email
// Admin sends a "set up your account" email to a user who has no password yet.
// If the user has no email on file, an email can be provided in the request body
// and will be saved to the user record before sending.
router.post("/:id/send-setup-email", authenticate, A, validateUuidParams("id"), async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.params["id"] as string;
  const { email: providedEmail } = req.body as { email?: string };

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) { res.status(404).json({ success: false, message: "User not found" }); return; }

  let targetEmail = user.email ?? "";

  // If admin supplied an email (for phone-only users), validate and save it first
  if (!targetEmail && providedEmail) {
    const normalized = providedEmail.toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      res.status(400).json({ success: false, message: "Invalid email address" }); return;
    }
    // Check the email isn't already used by another user
    const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, normalized)).limit(1);
    if (taken && taken.id !== userId) {
      res.status(409).json({ success: false, message: "This email is already used by another account" }); return;
    }
    await db.update(users).set({ email: normalized }).where(eq(users.id, userId));
    targetEmail = normalized;
  }

  if (!targetEmail) {
    res.status(400).json({ success: false, message: "No email address on file. Enter an email address to send the setup link." }); return;
  }

  if (!isEmailConfigured()) {
    res.status(503).json({ success: false, message: "Email delivery is not configured (RESEND_API_KEY missing)." }); return;
  }

  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SETUP_TOKEN_EXPIRY_MS);
  await db.update(users)
    .set({ passwordResetTokenHash: hashToken(token), passwordResetExpires: expires })
    .where(eq(users.id, userId));

  const host = process.env["REPLIT_DEV_DOMAIN"] ?? process.env["APP_DOMAIN"] ?? "swiftmart.space";
  const setupUrl = `https://${host}/auth?step=reset&token=${token}`;

  await sendAccountSetupEmail({ to: targetEmail, name: user.name, setupUrl, expiresHours: 24 });

  logger.info({ userId, email: targetEmail, sentBy: req.user!.userId }, "Account setup email sent by admin");
  res.json({ success: true, message: `Setup email sent to ${targetEmail}`, email: targetEmail });
});

// GET /api/users/me/profile
router.get("/me/profile", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const [user] = await db.select().from(users).where(eq(users.id, req.user!.userId)).limit(1);
  if (!user) { res.status(404).json({ success: false, message: "Not found" }); return; }
  res.json({ success: true, user: mi(user) });
});

// PATCH /api/users/me/profile
router.patch("/me/profile", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const { z } = await import("zod");
  const schema = z.object({
    name:      z.string().trim().min(2, "Name must be at least 2 characters").max(80).optional(),
    email:     z.string().trim().email("Invalid email address").max(200).optional(),
    pincode:   z.string().regex(/^\d{6}$/, "Pincode must be 6 digits").optional(),
    addresses: z.array(z.object({
      id:      z.string().optional(),
      label:   z.enum(["Home", "Work", "Other"]),
      line1:   z.string().min(1).max(200),
      line2:   z.string().max(200).optional(),
      city:    z.string().min(1).max(100),
      pincode: z.string().regex(/^\d{6}$/),
    })).max(10, "Maximum 10 addresses").optional(),
  }).strict();

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    const message = parsed.error.errors[0]?.message ?? "Invalid input";
    res.status(400).json({ success: false, message });
    return;
  }

  const update: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
  if (Object.keys(parsed.data).length === 0) {
    res.status(400).json({ success: false, message: "No fields to update" });
    return;
  }

  try {
    const [user] = await db.update(users).set(update).where(eq(users.id, req.user!.userId)).returning();
    if (!user) { res.status(404).json({ success: false, message: "User not found" }); return; }
    res.json({ success: true, user: mi(user) });
  } catch (err) {
    logger.error({ err }, "Failed to update user profile");
    res.status(500).json({ success: false, message: "Failed to update profile. Please try again." });
  }
});

export default router;
