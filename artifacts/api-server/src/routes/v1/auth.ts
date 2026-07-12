import { Router, type Request, type Response } from "express";
import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import { db, users, shops, otpSessions, servicePincodes as servicePincodesTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../../lib/jwt.js";
import { sendPasswordResetEmail, isEmailConfigured } from "../../lib/email.js";
import { authenticate, type AuthRequest } from "../../middlewares/auth.js";
import { mi } from "../../utils/mapId.js";
import { sendPasswordResetOtp, verify2FactorOtp, OTP_MODE } from "../../lib/sms.js";
import { logger } from "../../lib/logger.js";
import {
  loginLimiter,
  signupLimiter,
  resetPasswordLimiter,
  googleAuthLimiter,
  tokenRefreshLimiter,
} from "../../middlewares/rateLimiter.js";

import { isSuperAdminEmail } from "../../utils/seedAdmins.js";

const googleClient = new OAuth2Client(process.env["GOOGLE_CLIENT_ID"]);
const router = Router();

const BCRYPT_ROUNDS = 12;
const RESET_TOKEN_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes (kept for forgot-password flow)

type AuthMode = "otp" | "google" | "both";
const AUTH_MODE: AuthMode = (process.env["AUTH_MODE"] as AuthMode | undefined) ?? "otp";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatUser(u: typeof users.$inferSelect) {
  // Mask legacy fake-phone placeholders (g_<googleId>) — they should never reach the client
  const phone = u.phone?.startsWith("g_") ? "" : (u.phone ?? "");
  return {
    id: u.id,
    _id: u.id,
    name: u.name,
    phone,
    email: u.email ?? "",
    role: u.role,
    status: u.status,
    vendorStatus: u.vendorStatus,
    pincode: u.pincode ?? "",
    addresses: (u.addresses as unknown[]) ?? [],
    profilePhoto: u.profilePhoto ?? null,
  };
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function issueTokens(u: typeof users.$inferSelect) {
  const payload = {
    userId: u.id,
    phone: u.phone ?? "",
    role: u.role as "customer" | "vendor" | "admin" | "super_admin",
    tokenVersion: u.tokenVersion ?? 1,
  };
  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  };
}

// ─── GET /api/auth/config ─────────────────────────────────────────────────────
// This endpoint must NEVER crash — it is called on every page load and controls
// which login methods are shown. All errors are caught and a safe 200 is returned.
router.get("/config", async (_req: Request, res: Response): Promise<void> => {
  try {
    const googleClientId = process.env["GOOGLE_CLIENT_ID"] ?? "";
    const authMode = AUTH_MODE;

    if (!googleClientId && authMode !== "otp") {
      logger.warn({ authMode }, "GOOGLE_CLIENT_ID is not set — Google Sign-In will be unavailable");
    }

    const firebaseConfig = authMode !== "otp" ? {
      apiKey:            process.env["VITE_FIREBASE_API_KEY"]      ?? "",
      authDomain:        process.env["VITE_FIREBASE_AUTH_DOMAIN"]  ?? "",
      projectId:         process.env["VITE_FIREBASE_PROJECT_ID"]   ?? "",
      appId:             process.env["VITE_FIREBASE_APP_ID"]       ?? "",
      messagingSenderId: process.env["FIREBASE_MESSAGING_SENDER_ID"] ?? process.env["VITE_FIREBASE_MESSAGING_SENDER_ID"] ?? "",
    } : null;

    const rawPincodes = process.env["SERVICE_PINCODES"] ?? "733101,733102,733103";
    const envPincodes = rawPincodes.split(",").map(p => p.trim()).filter(Boolean);

    let servicePincodes: Array<{ pincode: string; area: string; state: string }>;
    try {
      const rows = await db.select().from(servicePincodesTable).where(eq(servicePincodesTable.isActive, true));
      servicePincodes = rows.length > 0
        ? rows.map(r => ({ pincode: r.pincode, area: r.area, state: r.state }))
        : envPincodes.map(p => ({ pincode: p, area: "Balurghat, South Dinajpur", state: "West Bengal" }));
    } catch {
      servicePincodes = envPincodes.map(p => ({ pincode: p, area: "Balurghat, South Dinajpur", state: "West Bengal" }));
    }

    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.json({
      success: true,
      authMode,
      googleClientId: authMode !== "otp" ? googleClientId : "",
      firebaseConfig,
      servicePincodes,
    });
  } catch (err) {
    logger.error({ err }, "/api/auth/config unexpected error — returning safe defaults");
    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.status(200).json({
      success: true,
      authMode: AUTH_MODE,
      googleClientId: process.env["GOOGLE_CLIENT_ID"] ?? "",
      firebaseConfig: null,
      servicePincodes: [],
    });
  }
});

// ─── POST /api/auth/check-phone ───────────────────────────────────────────────
// Step 1 of the phone-first login flow.
// Returns whether the phone is registered and whether a password exists.
// Used by the frontend to show the right form (login / create-password / signup).
router.post("/check-phone", loginLimiter, async (req: Request, res: Response): Promise<void> => {
  const { phone } = req.body as { phone?: string };

  if (!phone || !/^[6-9]\d{9}$/.test(phone)) {
    res.status(400).json({ success: false, message: "Valid 10-digit mobile number required" });
    return;
  }

  try {
    const [user] = await db
      .select({ id: users.id, passwordHash: users.passwordHash, status: users.status })
      .from(users)
      .where(eq(users.phone, phone))
      .limit(1);

    if (!user) {
      req.log.info({ phone }, "check-phone: number not registered");
      res.json({ success: true, exists: false, hasPassword: false });
      return;
    }

    if (user.status === "banned") {
      res.status(403).json({ success: false, message: "This account has been suspended. Please contact support." });
      return;
    }

    const hasPassword = !!user.passwordHash;
    req.log.info({ phone, userId: user.id, hasPassword }, "check-phone result");
    res.json({ success: true, exists: true, hasPassword });
  } catch (err) {
    req.log.error({ err, phone }, "check-phone failed");
    res.status(500).json({ success: false, message: "Request failed. Please try again." });
  }
});

// ─── POST /api/auth/set-password ─────────────────────────────────────────────
// Sets a password for an existing OTP user who has no password yet.
// No token required — this is the migration path for existing OTP users.
// Once a password is set, this endpoint returns an error (use forgot-password instead).
router.post("/set-password", loginLimiter, async (req: Request, res: Response): Promise<void> => {
  const { phone, password } = req.body as { phone?: string; password?: string };

  if (!phone || !/^[6-9]\d{9}$/.test(phone)) {
    res.status(400).json({ success: false, message: "Valid 10-digit mobile number required" });
    return;
  }
  if (!password || password.length < 8) {
    res.status(400).json({ success: false, message: "Password must be at least 8 characters" });
    return;
  }

  try {
    const [user] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);

    if (!user) {
      res.status(404).json({ success: false, message: "No account found for this mobile number" });
      return;
    }

    if (user.status === "banned") {
      res.status(403).json({ success: false, message: "This account has been suspended. Please contact support." });
      return;
    }

    // Only allowed for users who have never had a password (OTP migration)
    if (user.passwordHash) {
      req.log.info({ phone, userId: user.id }, "set-password: password already set — redirecting to login");
      res.status(409).json({ success: false, message: "A password is already set. Please use Login or Forgot Password." });
      return;
    }

    req.log.info({ phone, userId: user.id, passwordHashBefore: null }, "set-password: no password exists — creating");

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const [updated] = await db.update(users)
      .set({
        passwordHash,
        authProvider: "password",
        // Clear any stale reset tokens (e.g. from a previous forgot-password attempt)
        passwordResetTokenHash: null,
        passwordResetExpires: null,
        lastLoginAt: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning();

    if (!updated || !updated.passwordHash) {
      req.log.error({ phone, userId: user.id }, "set-password: DB update returned no row — password not saved");
      res.status(500).json({ success: false, message: "Failed to save password. Please try again." });
      return;
    }

    req.log.info({ phone, userId: updated.id, passwordHashAfter: updated.passwordHash ? "SET" : "MISSING" }, "set-password: password saved — auto login");
    res.json({
      success: true,
      isNewUser: false,
      hasPassword: true,
      ...issueTokens(updated),
      user: formatUser(updated),
    });
  } catch (err) {
    req.log.error({ err, phone }, "set-password failed");
    res.status(500).json({ success: false, message: "Failed to set password. Please try again." });
  }
});

// ─── POST /api/auth/signup ────────────────────────────────────────────────────
router.post("/signup", signupLimiter, async (req: Request, res: Response): Promise<void> => {
  const { z } = await import("zod");
  const parsed = z.object({
    name:     z.string().trim().min(2, "Full name must be at least 2 characters").max(80),
    phone:    z.string().trim().regex(/^[6-9]\d{9}$/, "Valid 10-digit mobile number required"),
    password: z.string().min(8, "Password must be at least 8 characters").max(128),
  }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: parsed.error.errors[0]?.message ?? "Invalid input" });
    return;
  }
  const { name, phone, password } = parsed.data;

  try {
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.phone, phone)).limit(1);
    if (existing) {
      res.status(409).json({ success: false, message: "An account with this mobile number already exists" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const [user] = await db.insert(users).values({
      name: name.trim(),
      phone,
      passwordHash,
      authProvider: "password",
      role: "customer",
      status: "active",
    }).returning();

    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    const [updated] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);

    req.log.info({ phone }, "New user signed up");
    res.status(201).json({
      success: true,
      isNewUser: true,
      ...issueTokens(updated),
      user: formatUser(updated),
    });
  } catch (err) {
    req.log.error({ err, phone }, "Signup failed");
    res.status(500).json({ success: false, message: "Signup failed. Please try again." });
  }
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
// Login with phone + password. Requires passwordHash to be set.
// If passwordHash is missing, instructs client to use set-password instead.
router.post("/login", loginLimiter, async (req: Request, res: Response): Promise<void> => {
  const { phone, password } = req.body as { phone?: string; password?: string };

  if (!phone || !/^[6-9]\d{9}$/.test(phone)) {
    res.status(400).json({ success: false, message: "Valid 10-digit mobile number required" });
    return;
  }
  if (!password) {
    res.status(400).json({ success: false, message: "Password required" });
    return;
  }

  try {
    const [user] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);

    if (!user) {
      res.status(401).json({ success: false, message: "Invalid mobile number or password" });
      return;
    }

    if (user.status === "banned") {
      res.status(403).json({ success: false, message: "Your account has been suspended. Please contact support." });
      return;
    }

    // OTP user who still has no password — direct them to set-password flow
    if (!user.passwordHash) {
      res.status(200).json({
        success: false,
        needsPasswordSetup: true,
        message: "Please create a password for your account.",
      });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      res.status(401).json({ success: false, message: "Invalid mobile number or password" });
      return;
    }

    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    const [updated] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);

    req.log.info({ phone, role: user.role }, "User logged in");
    res.json({
      success: true,
      isNewUser: false,
      ...issueTokens(updated),
      user: formatUser(updated),
    });
  } catch (err) {
    req.log.error({ err, phone }, "Login failed");
    res.status(500).json({ success: false, message: "Login failed. Please try again." });
  }
});

// ─── POST /api/auth/forgot-password ──────────────────────────────────────────
// For users who already have a password but forgot it.
// Real mode: sends a 6-digit OTP via 2Factor AUTOGEN SMS.
// Demo mode: logs a 6-digit code to the console (code "123456").
router.post("/forgot-password", resetPasswordLimiter, async (req: Request, res: Response): Promise<void> => {
  const { phone } = req.body as { phone?: string };

  if (!phone || !/^[6-9]\d{9}$/.test(phone)) {
    res.status(400).json({ success: false, message: "Valid 10-digit mobile number required" });
    return;
  }

  try {
    const [user] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);

    if (user && user.status !== "banned") {
      const smsResult = await sendPasswordResetOtp(phone);
      const expires = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);

      if (smsResult.success && smsResult.sessionId) {
        // Store "2fa:<sessionId>" so reset-password knows to verify via 2Factor
        await db.update(users)
          .set({ passwordResetTokenHash: `2fa:${smsResult.sessionId}`, passwordResetExpires: expires })
          .where(eq(users.id, user.id));
        req.log.info({ phone, mode: OTP_MODE }, "Password reset OTP sent");
      } else {
        // SMS failed — fall back to hex token and log to console
        const { randomBytes } = await import("node:crypto");
        const token = randomBytes(32).toString("hex");
        await db.update(users)
          .set({ passwordResetTokenHash: hashToken(token), passwordResetExpires: expires })
          .where(eq(users.id, user.id));
        req.log.warn({ phone, err: smsResult.error }, "SMS failed — falling back to console token");
        if (process.env["NODE_ENV"] !== "production") {
          req.log.info({ phone, expires: expires.toISOString() }, "DEV: password reset token generated (not shown in production)");
        }
      }
    }

    res.json({ success: true, message: "A 6-digit code has been sent to your mobile number." });
  } catch (err) {
    req.log.error({ err, phone }, "Forgot-password failed");
    res.status(500).json({ success: false, message: "Request failed. Please try again." });
  }
});

// ─── POST /api/auth/reset-password ───────────────────────────────────────────
// Reset a forgotten password using the 6-digit SMS code (or legacy hex token).
router.post("/reset-password", async (req: Request, res: Response): Promise<void> => {
  const { phone, token, newPassword } = req.body as { phone?: string; token?: string; newPassword?: string };

  if (!phone || !/^[6-9]\d{9}$/.test(phone)) {
    res.status(400).json({ success: false, message: "Valid 10-digit mobile number required" });
    return;
  }
  if (!token || !token.trim()) {
    res.status(400).json({ success: false, message: "Verification code required" });
    return;
  }
  if (!newPassword || newPassword.length < 8) {
    res.status(400).json({ success: false, message: "Password must be at least 8 characters" });
    return;
  }

  try {
    const [user] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);

    if (!user || !user.passwordResetTokenHash || !user.passwordResetExpires) {
      res.status(400).json({ success: false, message: "Invalid or expired code. Request a new one." });
      return;
    }
    if (user.passwordResetExpires < new Date()) {
      res.status(400).json({ success: false, message: "Code has expired. Please request a new one." });
      return;
    }

    // Verify: 2Factor SMS session ("2fa:<sessionId>") or legacy hex token
    let verified = false;
    if (user.passwordResetTokenHash.startsWith("2fa:")) {
      const sessionId = user.passwordResetTokenHash.slice(4);
      if (sessionId === "demo") {
        verified = token.trim() === "123456";
      } else {
        const result = await verify2FactorOtp(sessionId, token.trim());
        verified = result.success;
        if (!verified) {
          req.log.warn({ phone }, "2Factor password reset verify failed");
        }
      }
    } else {
      // Legacy: hex token hashed with SHA-256
      verified = token.length >= 10 && hashToken(token) === user.passwordResetTokenHash;
    }

    if (!verified) {
      res.status(400).json({ success: false, message: "Incorrect code. Please try again." });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await db.update(users)
      .set({
        passwordHash,
        authProvider: "password",
        passwordResetTokenHash: null,
        passwordResetExpires: null,
        tokenVersion: (user.tokenVersion ?? 1) + 1,
        lastLoginAt: new Date(),
      })
      .where(eq(users.id, user.id));

    const [updated] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);

    req.log.info({ phone }, "Password reset successful");
    res.json({ success: true, isNewUser: false, ...issueTokens(updated), user: formatUser(updated) });
  } catch (err) {
    req.log.error({ err, phone }, "Reset-password failed");
    res.status(500).json({ success: false, message: "Password reset failed. Please try again." });
  }
});

// ─── POST /api/auth/google ────────────────────────────────────────────────────
router.post("/google", googleAuthLimiter, async (req: Request, res: Response): Promise<void> => {
  if (AUTH_MODE === "otp") {
    res.status(403).json({ success: false, message: "Google login is not enabled." });
    return;
  }
  const { credential, accessToken: googleAccessToken } = req.body as { credential?: string; accessToken?: string };
  if (!credential && !googleAccessToken) {
    res.status(400).json({ success: false, message: "Google credential token required" });
    return;
  }
  try {
    let email: string | undefined;
    let name: string | undefined;
    let googleId: string | undefined;
    let profilePhoto: string | undefined;

    if (credential) {
      const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: process.env["GOOGLE_CLIENT_ID"] });
      const payload = ticket.getPayload();
      if (!payload?.email) { res.status(400).json({ success: false, message: "Invalid Google token" }); return; }
      email = payload.email; name = payload.name; googleId = payload.sub; profilePhoto = payload.picture;
    } else {
      const resp = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${googleAccessToken}` },
      });
      if (!resp.ok) { res.status(400).json({ success: false, message: "Invalid Google access token" }); return; }
      const info = await resp.json() as { email?: string; name?: string; sub?: string; picture?: string };
      if (!info.email) { res.status(400).json({ success: false, message: "Could not retrieve Google user info" }); return; }
      email = info.email; name = info.name; googleId = info.sub; profilePhoto = info.picture;
    }

    if (!email || !googleId) { res.status(400).json({ success: false, message: "Invalid Google token" }); return; }

    let [user] = await db.select().from(users).where(or(eq(users.googleId, googleId), eq(users.email, email))).limit(1);
    const isNewUser = !user;

    if (!user) {
      [user] = await db.insert(users).values({
        name: name ?? "User", email, googleId, phone: null,
        role: "customer", status: "active", authProvider: "google", profilePhoto: profilePhoto ?? null,
      }).returning();
    } else {
      await db.update(users).set({
        googleId: user.googleId ?? googleId,
        profilePhoto: user.profilePhoto ?? profilePhoto ?? null,
        authProvider: user.authProvider === "otp" ? "google" : user.authProvider,
      }).where(eq(users.id, user.id));
    }

    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    const [updated] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);

    const needsProfile = isNewUser || !updated.phone || updated.phone.startsWith("g_");
    res.json({ success: true, isNewUser, needsProfile, ...issueTokens(updated), user: formatUser(updated) });
  } catch (err) {
    req.log.error({ err }, "Google auth failed");
    res.status(401).json({ success: false, message: err instanceof Error ? err.message : "Google authentication failed" });
  }
});

// ─── GET /api/auth/google/redirect ───────────────────────────────────────────
// Starts the standard OAuth 2.0 authorization code flow.
// Redirects the browser to Google's consent page.
// Backward-compat: existing Google users (googleId / email already in DB from
// the old Firebase ID-token flow) are matched in /google/exchange by googleId
// OR email, so their accounts and all data are preserved automatically.
router.get("/google/redirect", (req: Request, res: Response): void => {
  const clientId     = process.env["GOOGLE_CLIENT_ID"];
  const clientSecret = process.env["GOOGLE_CLIENT_SECRET"];
  if (AUTH_MODE === "otp") {
    res.status(400).json({ success: false, message: "Google login is not enabled on this server." });
    return;
  }
  if (!clientId) {
    res.status(503).json({ success: false, message: "Google login is not configured — GOOGLE_CLIENT_ID is missing." });
    return;
  }
  if (!clientSecret) {
    res.status(503).json({ success: false, message: "Google login is not fully configured — GOOGLE_CLIENT_SECRET is missing. Add it in Replit → Tools → Secrets." });
    return;
  }

  const proto = ((req.headers["x-forwarded-proto"] as string | undefined) ?? "https").split(",")[0]!.trim();
  const host  = ((req.headers["x-forwarded-host"]  as string | undefined) ?? req.headers.host ?? "").split(",")[0]!.trim();
  const redirectUri = `${proto}://${host}/auth/google/callback`;

  req.log.info({ redirectUri }, "Google OAuth redirect — using this redirect_uri (must be registered in Google Cloud Console)");

  const nonce = randomBytes(16).toString("hex");
  const state = jwt.sign(
    { oauth: true, nonce, redirectUri },
    process.env["JWT_SECRET"]!,
    { expiresIn: "10m" },
  );

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

// ─── POST /api/auth/google/exchange ──────────────────────────────────────────
// Exchanges the authorization code returned by Google for a user session.
// Called by the frontend /auth/google/callback page.
router.post("/google/exchange", googleAuthLimiter, async (req: Request, res: Response): Promise<void> => {
  if (AUTH_MODE === "otp") {
    res.status(403).json({ success: false, message: "Google login is not enabled." });
    return;
  }

  const { code, state } = req.body as { code?: string; state?: string };
  if (!code || !state) {
    res.status(400).json({ success: false, message: "code and state are required" });
    return;
  }

  const clientId     = process.env["GOOGLE_CLIENT_ID"];
  const clientSecret = process.env["GOOGLE_CLIENT_SECRET"];
  if (!clientId || !clientSecret) {
    res.status(500).json({ success: false, message: "Google OAuth is not fully configured on the server. GOOGLE_CLIENT_SECRET is missing." });
    return;
  }

  let redirectUri: string;
  try {
    const payload = jwt.verify(state, process.env["JWT_SECRET"]!) as { oauth: boolean; redirectUri: string };
    if (!payload.oauth) throw new Error("Bad state");
    redirectUri = payload.redirectUri;
  } catch {
    res.status(400).json({ success: false, message: "Invalid or expired state. Please try signing in again." });
    return;
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      let googleError: { error?: string; error_description?: string } = {};
      try { googleError = await tokenRes.json() as typeof googleError; } catch { /* ignore */ }
      req.log.error({ googleError, redirectUri }, "Google token exchange failed");
      const detail = googleError.error_description ?? googleError.error ?? `HTTP ${tokenRes.status}`;
      res.status(400).json({
        success: false,
        message: `Google sign-in failed: ${detail}`,
        googleError: googleError.error,
      });
      return;
    }

    const tokenData = await tokenRes.json() as { id_token?: string; access_token?: string; error?: string; error_description?: string };
    if (tokenData.error) {
      req.log.error({ tokenData, redirectUri }, "Google token response contained error");
      res.status(400).json({ success: false, message: tokenData.error_description ?? tokenData.error });
      return;
    }

    let email: string | undefined;
    let name: string | undefined;
    let googleId: string | undefined;
    let profilePhoto: string | undefined;

    if (tokenData.id_token) {
      const ticket = await googleClient.verifyIdToken({ idToken: tokenData.id_token, audience: clientId });
      const payload = ticket.getPayload();
      if (!payload?.email) { res.status(400).json({ success: false, message: "Invalid Google token" }); return; }
      email = payload.email; name = payload.name; googleId = payload.sub; profilePhoto = payload.picture;
    } else if (tokenData.access_token) {
      const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (!userRes.ok) { res.status(400).json({ success: false, message: "Could not fetch profile from Google." }); return; }
      const info = await userRes.json() as { email?: string; name?: string; sub?: string; picture?: string };
      email = info.email; name = info.name; googleId = info.sub; profilePhoto = info.picture;
    }

    if (!email || !googleId) { res.status(400).json({ success: false, message: "Could not retrieve your Google account info." }); return; }

    let [user] = await db.select().from(users).where(or(eq(users.googleId, googleId), eq(users.email, email))).limit(1);
    const isNewUser = !user;

    if (!user) {
      [user] = await db.insert(users).values({
        name: name ?? "User", email, googleId, phone: null,
        role: "customer", status: "active", authProvider: "google", profilePhoto: profilePhoto ?? null,
      }).returning();
    } else {
      await db.update(users).set({
        googleId: user.googleId ?? googleId,
        profilePhoto: user.profilePhoto ?? profilePhoto ?? null,
        authProvider: user.authProvider === "otp" ? "google" : user.authProvider,
      }).where(eq(users.id, user.id));
    }

    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    const [updated] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);

    const needsProfile = isNewUser || !updated.phone || updated.phone.startsWith("g_");

    req.log.info({ email, isNewUser, needsProfile }, "Google OAuth exchange successful");
    res.json({ success: true, isNewUser, needsProfile, ...issueTokens(updated), user: formatUser(updated) });
  } catch (err) {
    req.log.error({ err }, "Google exchange failed");
    res.status(401).json({ success: false, message: err instanceof Error ? err.message : "Google authentication failed" });
  }
});

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────
router.post("/refresh", tokenRefreshLimiter, async (req: Request, res: Response): Promise<void> => {
  const { refreshToken } = req.body as { refreshToken?: string };
  if (!refreshToken) { res.status(400).json({ success: false, message: "Refresh token required" }); return; }
  try {
    const payload = verifyRefreshToken(refreshToken);
    const [user] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
    if (!user || user.status !== "active") { res.status(401).json({ success: false, message: "User not found or banned" }); return; }
    if ((user.tokenVersion ?? 1) !== (payload.tokenVersion ?? 1)) {
      res.status(401).json({ success: false, message: "Session has been revoked. Please log in again." });
      return;
    }
    res.json({ success: true, ...issueTokens(user) });
  } catch (err) {
    req.log.error({ err }, "Token refresh failed");
    res.status(401).json({ success: false, message: "Invalid refresh token" });
  }
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
router.get("/me", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, req.user!.userId)).limit(1);
    if (!user) { res.status(404).json({ success: false, message: "User not found" }); return; }

    let vendorProfile: Record<string, unknown> | undefined;
    if (user.vendorStatus === "approved" || user.vendorStatus === "pending") {
      const [shop] = await db.select({
        shopName: shops.shopName, category: shops.category, shopType: shops.shopType,
        description: shops.description, upiId: shops.upiId, bankAccountNumber: shops.bankAccountNumber,
        bankIfscCode: shops.bankIfscCode, panNumber: shops.panNumber, gstNumber: shops.gstNumber,
      }).from(shops).where(eq(shops.ownerId, user.id)).limit(1);
      if (shop) {
        vendorProfile = {
          storeName: shop.shopName, storeCategory: shop.category ?? shop.shopType,
          storeDescription: shop.description ?? "", upiId: shop.upiId,
          bankAccountNumber: shop.bankAccountNumber, bankIfscCode: shop.bankIfscCode,
          panNumber: shop.panNumber, gstNumber: shop.gstNumber ?? "",
        };
      }
    }

    res.json({ success: true, user: { ...formatUser(user), addresses: (user.addresses as unknown[]) ?? [], vendorProfile } });
  } catch (err) {
    req.log.error({ err }, "GET /me failed");
    res.status(500).json({ success: false, message: "Failed to fetch profile." });
  }
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
router.post("/logout", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    await db.update(users)
      .set({ tokenVersion: (req.user!.tokenVersion ?? 1) + 1 })
      .where(eq(users.id, userId));
    req.log.info({ userId }, "User logged out — tokens revoked");
    res.json({ success: true, message: "Logged out successfully" });
  } catch (err) {
    req.log.error({ err, userId: req.user?.userId }, "Logout DB update failed");
    res.status(500).json({ success: false, message: "Logout failed. Please try again." });
  }
});

// ─── POST /api/auth/email-signup ─────────────────────────────────────────────
// Sign up with email + password. Returns JWT tokens on success.
router.post("/email-signup", signupLimiter, async (req: Request, res: Response): Promise<void> => {
  const { z } = await import("zod");
  const parsed = z.object({
    name:     z.string().trim().min(2, "Full name must be at least 2 characters").max(80),
    email:    z.string().trim().email("Valid email address required").max(200),
    password: z.string().min(8, "Password must be at least 8 characters").max(128),
  }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: parsed.error.errors[0]?.message ?? "Invalid input" });
    return;
  }
  const { name, password } = parsed.data;
  const normalizedEmail = parsed.data.email.toLowerCase().trim();

  try {
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, normalizedEmail)).limit(1);
    if (existing) {
      res.status(409).json({ success: false, message: "An account with this email already exists. Please sign in." });
      return;
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const inferredRole = isSuperAdminEmail(normalizedEmail) ? "super_admin" : "customer";
    const [user] = await db.insert(users).values({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      authProvider: "email",
      role: inferredRole,
      status: "active",
    }).returning();

    if (inferredRole === "super_admin") {
      req.log.info({ email: normalizedEmail }, "New user signed up and granted super_admin via SUPER_ADMIN_EMAILS");
    }

    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    const [updated] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);

    req.log.info({ email: normalizedEmail, role: inferredRole }, "New user signed up via email");
    res.status(201).json({
      success: true,
      isNewUser: true,
      needsProfile: true,
      ...issueTokens(updated),
      user: formatUser(updated),
    });
  } catch (err) {
    req.log.error({ err, email: normalizedEmail }, "Email signup failed");
    res.status(500).json({ success: false, message: "Signup failed. Please try again." });
  }
});

// ─── POST /api/auth/email-login ──────────────────────────────────────────────
// Sign in with email + password. Returns JWT tokens on success.
router.post("/email-login", loginLimiter, async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ success: false, message: "Valid email address required" });
    return;
  }
  if (!password) {
    res.status(400).json({ success: false, message: "Password required" });
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();

  try {
    const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);

    if (!user) {
      res.status(401).json({ success: false, message: "Invalid email or password" });
      return;
    }
    if (user.status === "banned") {
      res.status(403).json({ success: false, message: "Your account has been suspended. Please contact support." });
      return;
    }
    if (!user.passwordHash) {
      res.status(401).json({ success: false, message: "This account uses a different sign-in method." });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      res.status(401).json({ success: false, message: "Invalid email or password" });
      return;
    }

    // Auto-promote to super_admin if this email is in SUPER_ADMIN_EMAILS
    if (isSuperAdminEmail(normalizedEmail) && user.role !== "super_admin") {
      await db.update(users).set({ role: "super_admin" }).where(eq(users.id, user.id));
      req.log.info({ email: normalizedEmail }, "Promoted email user to super_admin via SUPER_ADMIN_EMAILS on login");
    }

    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    const [updated] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);

    req.log.info({ email: normalizedEmail, role: updated.role }, "User signed in via email");
    res.json({
      success: true,
      isNewUser: false,
      needsProfile: !user.phone,
      ...issueTokens(updated),
      user: formatUser(updated),
    });
  } catch (err) {
    req.log.error({ err, email: normalizedEmail }, "Email login failed");
    res.status(500).json({ success: false, message: "Login failed. Please try again." });
  }
});

// ─── POST /api/auth/email-forgot-password ────────────────────────────────────
// Sends a password-reset link to the user's email via Resend.
// Falls back to console logging if RESEND_API_KEY is not configured.
router.post("/email-forgot-password", resetPasswordLimiter, async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body as { email?: string };

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ success: false, message: "Valid email address required" });
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();

  try {
    const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);

    if (user && user.status !== "banned") {
      const token = randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);

      await db.update(users)
        .set({ passwordResetTokenHash: hashToken(token), passwordResetExpires: expires })
        .where(eq(users.id, user.id));

      const proto = "https";
      const host  = process.env["REPLIT_DEV_DOMAIN"] ?? process.env["APP_DOMAIN"] ?? "swiftmart.space";
      const resetUrl = `${proto}://${host}/auth?step=reset&token=${token}`;
      const expiresMinutes = Math.round(RESET_TOKEN_EXPIRY_MS / 60_000);

      if (isEmailConfigured()) {
        await sendPasswordResetEmail({ to: normalizedEmail, resetUrl, expiresMinutes });
      } else {
        req.log.warn({ email: normalizedEmail }, "RESEND_API_KEY not set — reset link not delivered");
        if (process.env["NODE_ENV"] !== "production") {
          req.log.info({ email: normalizedEmail, expiresMinutes }, "DEV: password reset link generated (not shown in production)");
        }
      }

      req.log.info({ email: normalizedEmail, emailSent: isEmailConfigured() }, "Password reset link generated");
    }

    // Always return success to prevent email enumeration
    res.json({ success: true, message: "If an account with that email exists, a reset link has been sent." });
  } catch (err) {
    req.log.error({ err, email: normalizedEmail }, "Email forgot-password failed");
    res.status(500).json({ success: false, message: "Request failed. Please try again." });
  }
});

// ─── POST /api/auth/email-reset-password ─────────────────────────────────────
// Reset password using a hex token from the reset email.
router.post("/email-reset-password", async (req: Request, res: Response): Promise<void> => {
  const { token, newPassword } = req.body as { token?: string; newPassword?: string };

  if (!token || !token.trim()) {
    res.status(400).json({ success: false, message: "Reset token required" });
    return;
  }
  if (!newPassword || newPassword.length < 8) {
    res.status(400).json({ success: false, message: "Password must be at least 8 characters" });
    return;
  }

  try {
    const tokenHash = hashToken(token.trim());
    const [user] = await db.select().from(users)
      .where(eq(users.passwordResetTokenHash, tokenHash))
      .limit(1);

    if (!user || !user.passwordResetExpires) {
      res.status(400).json({ success: false, message: "Invalid or expired reset token." });
      return;
    }
    if (user.passwordResetExpires < new Date()) {
      res.status(400).json({ success: false, message: "Reset token has expired. Please request a new one." });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await db.update(users)
      .set({
        passwordHash,
        authProvider: "email",
        passwordResetTokenHash: null,
        passwordResetExpires: null,
        tokenVersion: (user.tokenVersion ?? 1) + 1,
        lastLoginAt: new Date(),
      })
      .where(eq(users.id, user.id));

    const [updated] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    req.log.info({ userId: user.id }, "Email password reset successful");
    res.json({ success: true, isNewUser: false, ...issueTokens(updated), user: formatUser(updated) });
  } catch (err) {
    req.log.error({ err }, "Email reset-password failed");
    res.status(500).json({ success: false, message: "Password reset failed. Please try again." });
  }
});

// ─── POST /api/auth/check-email ───────────────────────────────────────────────
// Returns whether an email address is already registered.
// Used by the frontend to route to sign-in vs sign-up.
router.post("/check-email", loginLimiter, async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body as { email?: string };

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ success: false, message: "Valid email address required" });
    return;
  }

  try {
    const [existing] = await db.select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()))
      .limit(1);

    res.json({ success: true, exists: Boolean(existing) });
  } catch (err) {
    req.log.error({ err }, "check-email DB error");
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ─── POST /api/auth/neon-bridge ───────────────────────────────────────────────
// Exchange a Neon Auth (Better Auth) session token for a SwiftMart JWT.
// Call this immediately after any Better Auth sign-in (email or Google).
router.post("/neon-bridge", loginLimiter, async (req: Request, res: Response): Promise<void> => {
  const { sessionToken } = req.body as { sessionToken?: string };

  if (!sessionToken || typeof sessionToken !== "string") {
    res.status(400).json({ success: false, message: "sessionToken is required" });
    return;
  }

  const neonAuthUrl = process.env["NEON_AUTH_BASE_URL"];
  if (!neonAuthUrl) {
    res.status(503).json({ success: false, message: "Auth service not configured (NEON_AUTH_BASE_URL missing)" });
    return;
  }

  // Verify session with the Neon-hosted Better Auth instance
  type NeonAuthUser = { id: string; email: string; name?: string | null; image?: string | null };
  let authUser: NeonAuthUser | null = null;
  try {
    const resp = await fetch(`${neonAuthUrl}/get-session`, {
      headers: { "Cookie": `better-auth.session_token=${sessionToken}` },
    });
    if (resp.ok) {
      const raw = await resp.json() as { user?: NeonAuthUser | null } | null;
      authUser = raw?.user ?? null;
    }
  } catch (err) {
    req.log.error({ err }, "Neon Auth get-session call failed");
    res.status(503).json({ success: false, message: "Auth service unavailable" });
    return;
  }

  if (!authUser || !authUser.email) {
    res.status(401).json({ success: false, message: "Invalid or expired session" });
    return;
  }

  const { email, name: authName, image, id: authUserId } = authUser;
  const normalizedEmail = email.toLowerCase().trim();

  try {
    // Find or create the SwiftMart user, linked by email
    let [user] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);

    if (!user) {
      // First sign-in — create a minimal record; phone & address collected in /complete-profile
      const newId = crypto.randomUUID();
      const rows = await db.insert(users).values({
        id: newId,
        email: normalizedEmail,
        name: authName?.trim() || "User",
        phone: null,
        authUserId,
        authProvider: "email",
        profilePhoto: image ?? null,
        role: "customer",
        status: "active",
        vendorStatus: "none",
        tokenVersion: 1,
      }).returning();
      user = rows[0];
    } else {
      // Existing user — link auth ID and update last-login
      const updates: Record<string, unknown> = { lastLoginAt: new Date() };
      if (!user.authUserId) updates["authUserId"] = authUserId;
      if (image && !user.profilePhoto) updates["profilePhoto"] = image;
      await db.update(users).set(updates).where(eq(users.id, user.id));
      const rows = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
      user = rows[0];
    }

    if (!user) {
      res.status(500).json({ success: false, message: "Failed to create user record" });
      return;
    }

    // Profile is "complete" when the user has set a non-generic name and a phone number
    const needsProfile = !user.phone || user.name === "User" || !user.name?.trim();

    req.log.info({ userId: user.id, email: normalizedEmail, needsProfile }, "Neon Auth bridge: user authenticated");

    res.json({
      success: true,
      needsProfile,
      ...issueTokens(user),
      user: formatUser(user),
    });
  } catch (err) {
    req.log.error({ err }, "neon-bridge DB error");
    res.status(500).json({ success: false, message: "Server error during sign-in" });
  }
});

// ─── POST /api/auth/complete-profile ─────────────────────────────────────────
// Save name, phone, pincode and optionally a first delivery address for a user
// who just signed in via Neon Auth for the first time.
router.post("/complete-profile", authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const { name, phone, pincode, address } = req.body as {
    name?: string;
    phone?: string;
    pincode?: string;
    address?: { label: string; line1: string; line2?: string; city: string; pincode: string };
  };

  if (!name?.trim()) {
    res.status(400).json({ success: false, message: "Name is required" });
    return;
  }
  if (phone && !/^[6-9]\d{9}$/.test(phone)) {
    res.status(400).json({ success: false, message: "Invalid mobile number" });
    return;
  }

  try {
    const [existing] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!existing) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    // Phone-based account linking: if phone already belongs to another user, merge into that account
    if (phone) {
      const [taken] = await db.select()
        .from(users)
        .where(eq(users.phone, phone))
        .limit(1);

      if (taken && taken.id !== userId) {
        // Merge: bring email/passwordHash from the new (email-signup) account into the existing phone account
        const mergeUpdates: Record<string, unknown> = { updatedAt: new Date() };
        if (!taken.email && existing.email) mergeUpdates["email"] = existing.email;
        if (!taken.passwordHash && existing.passwordHash) mergeUpdates["passwordHash"] = existing.passwordHash;
        if (!taken.name || taken.name === "User") mergeUpdates["name"] = name.trim();
        if (pincode && !taken.pincode) mergeUpdates["pincode"] = pincode;
        if (address) {
          const takenAddresses = (taken.addresses as unknown[]) ?? [];
          mergeUpdates["addresses"] = [...takenAddresses, { id: crypto.randomUUID(), ...address }];
        }

        await db.update(users).set(mergeUpdates).where(eq(users.id, taken.id));
        // Delete the stub email-signup account
        await db.delete(users).where(eq(users.id, userId));
        const [merged] = await db.select().from(users).where(eq(users.id, taken.id)).limit(1);
        req.log.info({ userId: taken.id, mergedFrom: userId }, "Accounts merged via phone number");
        res.json({ success: true, merged: true, ...issueTokens(merged), user: formatUser(merged) });
        return;
      }
    }

    const currentAddresses = (existing.addresses as unknown[]) ?? [];
    const addresses = address
      ? [...currentAddresses, { id: crypto.randomUUID(), ...address }]
      : currentAddresses;

    const updates: Record<string, unknown> = {
      name: name.trim(),
      updatedAt: new Date(),
      addresses,
    };
    if (phone) updates["phone"] = phone;
    if (pincode) updates["pincode"] = pincode;

    await db.update(users).set(updates).where(eq(users.id, userId));
    const [updated] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    res.json({ success: true, user: formatUser(updated) });
  } catch (err) {
    req.log.error({ err, userId }, "complete-profile error");
    res.status(500).json({ success: false, message: "Failed to save profile" });
  }
});

// ─── Legacy OTP routes (410 Gone) ─────────────────────────────────────────────
router.post("/send-otp", (_req: Request, res: Response): void => {
  res.status(410).json({ success: false, message: "OTP login is no longer supported. Please use email + password." });
});
router.post("/verify-otp", (_req: Request, res: Response): void => {
  res.status(410).json({ success: false, message: "OTP login is no longer supported. Please use email + password." });
});

// Suppress unused import warnings
void otpSessions;
void mi;
void RESET_TOKEN_EXPIRY_MS;

export default router;
