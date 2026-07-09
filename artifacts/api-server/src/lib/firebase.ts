import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { logger } from "./logger";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _messaging: any = null;
let _initialised = false;

function resolveServiceAccount(): object | null {
  // 1. FIREBASE_SERVICE_ACCOUNT env var (production / Replit secrets)
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch {
      logger.error("FIREBASE_SERVICE_ACCOUNT is set but is not valid JSON");
    }
  }
  // 2. JSON file placed next to the server (dev workflow)
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    // Built output lives in dist/ — one level up is the project root
    const filePath = join(__dirname, "../firebase-service-account.json");
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    // file absent — skip silently
  }
  return null;
}

async function init() {
  if (_initialised) return;
  _initialised = true;

  const serviceAccount = resolveServiceAccount();
  if (!serviceAccount) {
    logger.warn(
      "Firebase Admin: no credentials found — FCM push disabled. " +
        "Set FIREBASE_SERVICE_ACCOUNT secret or place firebase-service-account.json beside the server."
    );
    return;
  }

  try {
    // Use the modular sub-package imports (firebase-admin v10+)
    const { initializeApp, cert } = await import("firebase-admin/app");
    const { getMessaging } = await import("firebase-admin/messaging");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const app = initializeApp({ credential: cert(serviceAccount as any) });
    _messaging = getMessaging(app);
    logger.info("Firebase Admin initialised — FCM ready");
  } catch (err) {
    logger.error({ err }, "Firebase Admin init failed");
  }
}

// Kick off non-blocking init at module load time
init();

/** Returns the Firebase Messaging instance, or null if not configured. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getFirebaseMessaging(): any | null {
  return _messaging;
}

/**
 * Detect whether a token is an FCM registration token or an Expo push token.
 * Expo tokens start with  ExponentPushToken[
 * FCM tokens are long alphanumeric strings without that prefix.
 */
export function isFcmToken(token: string): boolean {
  return !token.startsWith("ExponentPushToken[");
}
