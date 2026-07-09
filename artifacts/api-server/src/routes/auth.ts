/**
 * POST /api/auth/truecaller
 *
 * Accepts a verified Truecaller profile from the mobile SDK.
 * Requires TRUECALLER_APP_SECRET (Replit Secret) — the endpoint refuses
 * requests if the secret is absent so token verification can never be skipped.
 *
 * Flow:
 *  1. Verify the Truecaller access token against Truecaller's Profile API
 *     using TRUECALLER_APP_SECRET.  Reject if verification fails.
 *  2. Derive a stable, server-side-only password:
 *     HMAC-SHA256(verifiedPhone, TRUECALLER_APP_SECRET)
 *     This is NOT guessable from the phone number alone; the secret is required.
 *  3. Try to register the user on the production API.
 *     If the phone already exists, log in with the HMAC-derived password.
 *  4. If the account was created with a different password (manual sign-up),
 *     return 409 so the client can tell the user to link Truecaller manually.
 *
 * Body: { accessToken, requestNonce?, phone, name, email? }
 */
import { Router } from "express";
import { createHmac, createHash } from "crypto";
import { logger } from "../lib/logger";

const router = Router();
const UPSTREAM = "https://swiftmart.space/api";
const TRUECALLER_PROFILE_API = "https://api4.truecaller.com/v1/default";

/**
 * Verify the Truecaller access token with Truecaller's own API.
 * Returns the verified profile, or throws an Error on failure.
 */
async function verifyTruecallerToken(
  accessToken: string,
  appSecret: string,
): Promise<{ phoneNumber: string; name: string; email?: string }> {
  // Truecaller's profile endpoint validates the bearer token and returns
  // the user's profile directly.  No client-supplied phone/name is trusted.
  const res = await fetch(TRUECALLER_PROFILE_API, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      // Some Truecaller API versions require the app key as a header
      "X-Truecaller-App-Secret": appSecret,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    logger.warn({ status: res.status, text }, "Truecaller token verification failed");
    throw new Error("Truecaller token verification failed — invalid or expired access token");
  }

  const data = await res.json() as Record<string, unknown>;
  const phoneNumber = data.phoneNumber as string | undefined;
  if (!phoneNumber) {
    throw new Error("Truecaller profile API returned no phone number");
  }
  const name = [data.firstName, data.lastName].filter(Boolean).join(" ")
    || (data.name as string)
    || phoneNumber;

  return { phoneNumber, name, email: data.email as string | undefined };
}

/** HMAC-SHA256 of the phone number, keyed by the server secret. */
function derivePassword(phone: string, secret: string): string {
  return createHmac("sha256", secret).update(phone).digest("hex");
}

function hasToken(d: Record<string, unknown>): boolean {
  const nested = (d.data ?? {}) as Record<string, unknown>;
  return !!(d.token ?? d.accessToken ?? nested.token ?? nested.accessToken);
}

// ─── Route ────────────────────────────────────────────────────────────────────

router.post("/truecaller", async (req, res) => {
  const appSecret = process.env.TRUECALLER_APP_SECRET;

  // Hard requirement — refuse all requests if the secret is absent.
  // This prevents the endpoint from being a no-auth account creation vector.
  if (!appSecret) {
    res.status(503).json({
      success: false,
      message:
        "Truecaller login is not configured on this server (TRUECALLER_APP_SECRET missing).",
    });
    return;
  }

  const body = req.body as { accessToken?: string; requestNonce?: string; phone?: string; name?: string; email?: string };
  const { accessToken } = body;

  if (!accessToken) {
    res.status(400).json({ success: false, message: "accessToken is required" });
    return;
  }

  // ── Step 1: Server-side token verification (mandatory) ────────────────────
  let verified: { phoneNumber: string; name: string; email?: string };
  try {
    verified = await verifyTruecallerToken(accessToken, appSecret);
  } catch (err: unknown) {
    res.status(401).json({
      success: false,
      message: err instanceof Error ? err.message : "Truecaller token verification failed",
    });
    return;
  }

  const { phoneNumber, name, email } = verified;

  // ── Step 2: Derive a stable server-side password ──────────────────────────
  // HMAC(phone, TRUECALLER_APP_SECRET) — only reproducible if you have the secret.
  const derivedPassword = derivePassword(phoneNumber, appSecret);

  // ── Step 3a: Try to register the user ─────────────────────────────────────
  try {
    const regRes = await fetch(`${UPSTREAM}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        name,
        phone: phoneNumber,
        email: email ?? `tc.${createHash("md5").update(phoneNumber).digest("hex")}@swiftmart.tc`,
        password: derivedPassword,
        role: "customer",
      }),
    });
    const regData = await regRes.json().catch(() => ({})) as Record<string, unknown>;

    if (regRes.ok && hasToken(regData)) {
      logger.info({ phone: phoneNumber }, "Truecaller: new user registered");
      res.json({ success: true, ...regData });
      return;
    }
  } catch (err) {
    logger.error({ err }, "Truecaller: upstream register request failed");
  }

  // ── Step 3b: Account exists — try logging in with derived password ─────────
  try {
    const loginRes = await fetch(`${UPSTREAM}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ phone: phoneNumber, password: derivedPassword }),
    });
    const loginData = await loginRes.json().catch(() => ({})) as Record<string, unknown>;

    if (loginRes.ok && hasToken(loginData)) {
      logger.info({ phone: phoneNumber }, "Truecaller: returning user logged in");
      res.json({ success: true, ...loginData });
      return;
    }
  } catch (err) {
    logger.error({ err }, "Truecaller: upstream login request failed");
  }

  // ── Step 3c: Account exists with a different password (manual sign-up) ────
  // We cannot bypass the production API's password check.
  // Tell the client to ask the user to sign in normally and link Truecaller.
  logger.warn({ phone: phoneNumber }, "Truecaller: phone exists with different credentials");
  res.status(409).json({
    success: false,
    code: "ACCOUNT_EXISTS",
    message:
      "This phone number is linked to an account created with a password. " +
      "Please sign in with your password, then link Truecaller from your profile settings.",
  });
});

export default router;
