/**
 * Auth routes served by our api-server:
 *
 * POST /api/auth/email-login
 *   Accepts { email, password }.
 *   Verifies the bcrypt hash in the Neon `users` table, then forwards
 *   phone + password to the production API to obtain a production token.
 *   Returns the production token so the mobile app can call all production
 *   API endpoints as normal.
 *
 * POST /api/auth/truecaller
 *   Server-side Truecaller token verification + HMAC-derived login.
 *   Requires TRUECALLER_APP_SECRET env var.
 */
import { Router } from 'express';
import { createHmac, createHash } from 'crypto';
import bcrypt from 'bcryptjs';
import { neonPool } from '../lib/neonDb';
import { logger } from '../lib/logger';

const router = Router();
const UPSTREAM = 'https://swiftmart.space/api';

// ─── helpers ─────────────────────────────────────────────────────────────────

function hasToken(d: Record<string, unknown>): boolean {
  const nested = (d.data ?? {}) as Record<string, unknown>;
  return !!(d.token ?? d.accessToken ?? nested.token ?? nested.accessToken);
}

async function upstreamPhoneLogin(
  phone: string,
  password: string,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${UPSTREAM}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ phone, password }),
  });
  const data: unknown = await res.json().catch(() => ({}));
  return (data ?? {}) as Record<string, unknown>;
}

// ─── POST /email-login ────────────────────────────────────────────────────────

router.post('/email-login', async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ success: false, message: 'Email and password are required.' });
    return;
  }

  // 1. Look up user in Neon DB by email
  let row: { phone: string; password_hash: string; name: string } | undefined;
  try {
    if (!neonPool) {
      res.status(503).json({ success: false, message: 'Database not configured.' });
      return;
    }
    const result = await neonPool.query<{ phone: string; password_hash: string; name: string }>(
      `SELECT phone, password_hash, name
       FROM users
       WHERE LOWER(email) = LOWER($1) AND auth_provider = 'email'
       LIMIT 1`,
      [email.trim()],
    );
    row = result.rows[0];
  } catch (err) {
    logger.error({ err }, 'email-login: DB query failed');
    res.status(503).json({ success: false, message: 'Service unavailable. Please try again.' });
    return;
  }

  if (!row) {
    // Return the same message whether the email doesn't exist or the password
    // is wrong — avoids email enumeration.
    res.status(401).json({ success: false, message: 'Invalid email or password.' });
    return;
  }

  // 2. Verify password against Neon bcrypt hash
  const valid = await bcrypt.compare(password, row.password_hash);
  if (!valid) {
    res.status(401).json({ success: false, message: 'Invalid email or password.' });
    return;
  }

  // 3. Forward to production API using the verified phone + plain password
  let data: Record<string, unknown> = {};
  try { data = await upstreamPhoneLogin(row.phone, password); } catch { /* network error */ }

  if (hasToken(data)) {
    logger.info({ email, phone: row.phone }, 'email-login: success');
    res.json({ success: true, ...data });
    return;
  }

  // Production API rejected the login — could mean the account exists in
  // Neon DB but not yet in the MongoDB backend, or the password differs.
  logger.warn({ email, phone: row.phone, upstream: data }, 'email-login: upstream rejected');
  res.status(401).json({
    success: false,
    message:
      (data.message as string) ||
      'Sign in failed. If you registered via the website, please try signing in with Google.',
  });
});

// ─── POST /truecaller ─────────────────────────────────────────────────────────

const TRUECALLER_PROFILE_API = 'https://api4.truecaller.com/v1/default';

async function verifyTruecallerToken(
  accessToken: string,
  appSecret: string,
): Promise<{ phoneNumber: string; name: string; email?: string }> {
  const res = await fetch(TRUECALLER_PROFILE_API, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'X-Truecaller-App-Secret': appSecret,
    },
  });
  if (!res.ok) {
    throw new Error('Truecaller token verification failed — invalid or expired access token');
  }
  const data = await res.json() as Record<string, unknown>;
  const phoneNumber = data.phoneNumber as string | undefined;
  if (!phoneNumber) throw new Error('Truecaller profile API returned no phone number');
  const name =
    [data.firstName, data.lastName].filter(Boolean).join(' ') ||
    (data.name as string) ||
    phoneNumber;
  return { phoneNumber, name, email: data.email as string | undefined };
}

function derivePassword(phone: string, secret: string): string {
  return createHmac('sha256', secret).update(phone).digest('hex');
}

router.post('/truecaller', async (req, res) => {
  const appSecret = process.env.TRUECALLER_APP_SECRET;
  if (!appSecret) {
    res.status(503).json({
      success: false,
      message: 'Truecaller login is not configured on this server (TRUECALLER_APP_SECRET missing).',
    });
    return;
  }

  const { accessToken } = req.body as { accessToken?: string };
  if (!accessToken) {
    res.status(400).json({ success: false, message: 'accessToken is required' });
    return;
  }

  let verified: { phoneNumber: string; name: string; email?: string };
  try {
    verified = await verifyTruecallerToken(accessToken, appSecret);
  } catch (err: unknown) {
    res.status(401).json({
      success: false,
      message: err instanceof Error ? err.message : 'Truecaller token verification failed',
    });
    return;
  }

  const { phoneNumber, name, email } = verified;
  const derivedPassword = derivePassword(phoneNumber, appSecret);

  // Try register
  try {
    const regRes = await fetch(`${UPSTREAM}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        name,
        phone: phoneNumber,
        email: email ?? `tc.${createHash('md5').update(phoneNumber).digest('hex')}@swiftmart.tc`,
        password: derivedPassword,
        role: 'customer',
      }),
    });
    const regData = await regRes.json().catch(() => ({})) as Record<string, unknown>;
    if (regRes.ok && hasToken(regData)) {
      logger.info({ phone: phoneNumber }, 'Truecaller: new user registered');
      res.json({ success: true, ...regData });
      return;
    }
  } catch (err) {
    logger.error({ err }, 'Truecaller: upstream register failed');
  }

  // Try login with derived password
  try {
    const loginData = await upstreamPhoneLogin(phoneNumber, derivedPassword);
    if (hasToken(loginData)) {
      logger.info({ phone: phoneNumber }, 'Truecaller: returning user logged in');
      res.json({ success: true, ...loginData });
      return;
    }
  } catch (err) {
    logger.error({ err }, 'Truecaller: upstream login failed');
  }

  logger.warn({ phone: phoneNumber }, 'Truecaller: account exists with different credentials');
  res.status(409).json({
    success: false,
    code: 'ACCOUNT_EXISTS',
    message:
      'This phone number is linked to an account created with a password. ' +
      'Please sign in with your email and password, then link Truecaller from your profile settings.',
  });
});

export default router;
