import app from "./app.js";
import { logger } from "./lib/logger.js";
import { seedSuperAdmins } from "./utils/seedAdmins.js";
import { seedShopTypes } from "./utils/seedShopTypes.js";
import { seedCategories } from "./utils/seedCategories.js";
import { clearDemoData } from "./utils/seedDemoData.js";
import { cleanupAbandonedOrders } from "./utils/orderCleanup.js";
import { OTP_MODE } from "./lib/sms.js";

// AUTH_MODE controls which login methods are enabled (otp | google | both).
// Default is "otp" — safe to run without a domain or Google OAuth credentials.
type AuthMode = "otp" | "google" | "both";
const AUTH_MODE: AuthMode = (process.env["AUTH_MODE"] as AuthMode | undefined) ?? "otp";

// Fail fast on missing required secrets; warn on missing optional ones at boot time
// so issues surface in logs immediately rather than on first customer request.
function validateEnv(): void {
  // PORT is injected by Render at runtime — warn only, do not crash
  const required = ["DATABASE_URL", "JWT_SECRET", "JWT_REFRESH_SECRET"];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  const optionalWarnings: Array<[string, string]> = [
    ["GOOGLE_CLIENT_ID",      "Google Sign-In will not work — /api/auth/config will return empty googleClientId"],
    ["RAZORPAY_KEY_ID",       "Razorpay payments will not work"],
    ["RAZORPAY_KEY_SECRET",   "Razorpay payments will not work"],
    ["CLOUDINARY_CLOUD_NAME", "Image uploads will not work"],
    ["CLOUDINARY_API_KEY",    "Image uploads will not work"],
    ["CLOUDINARY_API_SECRET", "Image uploads will not work"],
    ["TWO_FACTOR_API_KEY",    "OTP SMS will not work (set OTP_MODE=demo to suppress)"],
    ["FIREBASE_PROJECT_ID",   "FCM push notifications will not work"],
    ["FIREBASE_CLIENT_EMAIL", "FCM push notifications will not work"],
    ["FIREBASE_PRIVATE_KEY",  "FCM push notifications will not work"],
  ];
  if (process.env["GOOGLE_CLIENT_ID"]) {
    logger.info({ googleClientIdLength: process.env["GOOGLE_CLIENT_ID"].length }, "GOOGLE_CLIENT_ID is set — Google Sign-In enabled");
    // GOOGLE_CLIENT_SECRET is required for the server-side OAuth2 code exchange.
    // Without it the user will see an error after choosing their Google account.
    if (!process.env["GOOGLE_CLIENT_SECRET"]) {
      logger.error(
        "GOOGLE_CLIENT_SECRET is NOT set — server-side Google OAuth2 will fail at the code exchange step. " +
        "Add it in Tools → Secrets. Get it from Google Cloud Console → APIs & Services → Credentials → your OAuth 2.0 Client."
      );
    } else {
      logger.info("GOOGLE_CLIENT_SECRET is set — server-side OAuth2 exchange enabled");
    }
  }
  for (const [key, impact] of optionalWarnings) {
    if (!process.env[key]) {
      logger.warn({ key }, `Optional secret missing — ${impact}`);
    }
  }
}

validateEnv();

const PORT = Number(process.env["PORT"] ?? 10000);

async function main() {
  // Bind immediately so the health check passes before seeds run
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve, reject) => {
    const s = app.listen(PORT, "0.0.0.0", (err?: Error) => {
      if (err) { reject(err); return; }
      logger.info({ port: PORT }, "SwiftMart API Server listening");
      logger.info(
        { otpMode: OTP_MODE, authMode: AUTH_MODE, twoFactorKeyPresent: !!process.env["TWO_FACTOR_API_KEY"] },
        `Auth mode: ${AUTH_MODE} | OTP mode: ${OTP_MODE} | 2Factor key present: ${!!process.env["TWO_FACTOR_API_KEY"]}`
      );
      resolve(s);
    });
  });

  // Graceful shutdown — Render sends SIGTERM before replacing the instance
  process.on("SIGTERM", () => {
    logger.info("SIGTERM received — shutting down gracefully");
    server.close(() => {
      logger.info("HTTP server closed");
      process.exit(0);
    });
    // Force-exit after 10 s if connections linger
    setTimeout(() => process.exit(0), 10_000).unref();
  });

  // Seeds run AFTER server is already listening (non-blocking for health check)
  setImmediate(async () => {
    try {
      await seedSuperAdmins();
      await seedShopTypes();
      await seedCategories();
      await clearDemoData();
      logger.info("Seed complete");
    } catch (err) {
      logger.error({ err }, "Seed error (non-fatal)");
    }
  });

  // Background job: cancel online-payment orders stuck pending > 15 min
  const runCleanup = async () => {
    try {
      const count = await cleanupAbandonedOrders();
      if (count > 0) logger.info({ count }, "Cleaned up abandoned payment orders");
    } catch (err) {
      logger.error({ err }, "cleanupAbandonedOrders error (non-fatal)");
    }
  };
  void runCleanup();
  setInterval(runCleanup, 10 * 60 * 1000);
}

main().catch((err) => {
  logger.error({ err }, "Fatal startup error");
  process.exit(1);
});
