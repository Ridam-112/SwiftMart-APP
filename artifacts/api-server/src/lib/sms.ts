// OTP_MODE=real  → always call 2Factor AUTOGEN (SMS-guaranteed, no DLT template needed)
// OTP_MODE=demo  → use 123456 demo code, never call 2Factor
// Default (unset) → demo

export const OTP_MODE: "real" | "demo" =
  process.env["OTP_MODE"] === "real" ? "real" : "demo";

const TWO_FACTOR_API_KEY = process.env["TWO_FACTOR_API_KEY"];

export interface SmsResult {
  success: boolean;
  /** Returned only when OTP_MODE=real — 2Factor session ID used for verification */
  sessionId?: string;
  error?: string;
}

/**
 * In real mode: calls 2Factor AUTOGEN — 2Factor generates + sends the OTP via SMS
 * and returns a sessionId. We store that sessionId and verify via 2Factor later.
 * In demo mode: returns success immediately (no network call).
 */
export async function sendOtpSms(phone: string): Promise<SmsResult> {
  if (OTP_MODE === "demo") {
    console.info(`[sms] DEMO mode — phone ${phone}, OTP is 123456`);
    return { success: true };
  }

  if (!TWO_FACTOR_API_KEY) {
    return { success: false, error: "OTP_MODE=real but TWO_FACTOR_API_KEY is not set. Add it to Replit Secrets." };
  }

  try {
    // AUTOGEN: 2Factor generates the OTP and sends it via SMS (pre-approved template, no DLT needed)
    const url = `https://2factor.in/API/V1/${TWO_FACTOR_API_KEY}/SMS/91${phone}/AUTOGEN`;
    const res = await fetch(url);

    const raw = await res.text();
    let data: { Status?: string; Details?: string };
    try {
      data = JSON.parse(raw) as typeof data;
    } catch {
      return { success: false, error: `2Factor non-JSON response (HTTP ${res.status}): ${raw.slice(0, 200)}` };
    }

    if (!res.ok || data.Status !== "Success") {
      return { success: false, error: `2Factor error: ${data.Details ?? data.Status ?? `HTTP ${res.status}`}` };
    }

    // Details contains the session ID used to verify the OTP later
    return { success: true, sessionId: data.Details };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `2Factor network error: ${msg}` };
  }
}

/**
 * Sends a password-reset OTP via 2Factor AUTOGEN in real mode.
 * Uses the same AUTOGEN endpoint as login OTP — no DLT template required.
 * In demo mode: returns a fake sessionId of "demo" (code "123456").
 */
export async function sendPasswordResetOtp(phone: string): Promise<SmsResult> {
  if (OTP_MODE === "demo") {
    console.info(`[sms] DEMO mode — password reset OTP for ${phone}: 123456`);
    return { success: true, sessionId: "demo" };
  }

  if (!TWO_FACTOR_API_KEY) {
    return { success: false, error: "TWO_FACTOR_API_KEY is not set. Add it to Replit Secrets." };
  }

  try {
    const url = `https://2factor.in/API/V1/${TWO_FACTOR_API_KEY}/SMS/91${phone}/AUTOGEN`;
    const res = await fetch(url);
    const raw = await res.text();
    let data: { Status?: string; Details?: string };
    try { data = JSON.parse(raw) as typeof data; }
    catch { return { success: false, error: `2Factor non-JSON (HTTP ${res.status}): ${raw.slice(0, 200)}` }; }
    if (!res.ok || data.Status !== "Success") {
      return { success: false, error: `2Factor error: ${data.Details ?? data.Status ?? `HTTP ${res.status}`}` };
    }
    return { success: true, sessionId: data.Details };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `2Factor network error: ${msg}` };
  }
}

/**
 * Verifies the OTP the user entered against 2Factor's session.
 * Only called when OTP_MODE=real (session.otp starts with "2fa:").
 */
export async function verify2FactorOtp(sessionId: string, otp: string): Promise<{ success: boolean; error?: string }> {
  if (!TWO_FACTOR_API_KEY) {
    return { success: false, error: "TWO_FACTOR_API_KEY is not set" };
  }

  try {
    const url = `https://2factor.in/API/V1/${TWO_FACTOR_API_KEY}/SMS/VERIFY/${sessionId}/${otp}`;
    const res = await fetch(url);

    const raw = await res.text();
    let data: { Status?: string; Details?: string };
    try {
      data = JSON.parse(raw) as typeof data;
    } catch {
      return { success: false, error: `2Factor verify non-JSON (HTTP ${res.status}): ${raw.slice(0, 200)}` };
    }

    if (!res.ok || data.Status !== "Success") {
      return { success: false, error: `2Factor verify error: ${data.Details ?? data.Status ?? `HTTP ${res.status}`}` };
    }

    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `2Factor verify network error: ${msg}` };
  }
}
