import { Resend } from "resend";
import { logger } from "./logger.js";

const FROM = process.env["RESEND_FROM_EMAIL"] ?? "onboarding@resend.dev";

export function isEmailConfigured(): boolean {
  return !!process.env["RESEND_API_KEY"];
}

function getResendClient(): Resend {
  const key = process.env["RESEND_API_KEY"];
  if (!key) {
    throw new Error("RESEND_API_KEY is not set — email delivery is unavailable.");
  }
  return new Resend(key);
}

export async function sendPasswordResetEmail(opts: {
  to: string;
  resetUrl: string;
  expiresMinutes: number;
}): Promise<void> {
  const { to, resetUrl, expiresMinutes } = opts;

  const resend = getResendClient();

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: "Reset your SwiftMart password",
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset your password</title>
</head>
<body style="margin:0;padding:0;background:#0d0d0d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d0d;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#1a1a1a;border-radius:16px;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background:#b45309;padding:28px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">SwiftMart</h1>
              <p style="margin:6px 0 0;color:#fde68a;font-size:13px;">10-minute delivery</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 32px;">
              <h2 style="margin:0 0 12px;color:#f5f5f5;font-size:20px;font-weight:600;">Reset your password</h2>
              <p style="margin:0 0 24px;color:#a3a3a3;font-size:15px;line-height:1.6;">
                We received a request to reset the password for your SwiftMart account.
                Click the button below to choose a new password.
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 28px;">
                    <a href="${resetUrl}"
                       style="display:inline-block;background:#b45309;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 32px;border-radius:10px;">
                      Reset password
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;color:#737373;font-size:13px;line-height:1.5;">
                This link expires in <strong style="color:#a3a3a3;">${expiresMinutes} minutes</strong>.
                If you didn't request a password reset, you can safely ignore this email — your password will not change.
              </p>

              <!-- Fallback link -->
              <div style="background:#262626;border-radius:8px;padding:14px;margin-top:20px;">
                <p style="margin:0 0 6px;color:#737373;font-size:12px;">Or copy this link into your browser:</p>
                <p style="margin:0;color:#b45309;font-size:12px;word-break:break-all;">${resetUrl}</p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="border-top:1px solid #262626;padding:20px 32px;text-align:center;">
              <p style="margin:0;color:#525252;font-size:12px;">
                © ${new Date().getFullYear()} SwiftMart · This is an automated message, please do not reply.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    text: `Reset your SwiftMart password\n\nClick this link to reset your password (expires in ${expiresMinutes} minutes):\n${resetUrl}\n\nIf you didn't request this, ignore this email — your password will not change.`,
  });

  if (error) {
    logger.error({ error, to }, "Resend failed to send password reset email");
    throw new Error(`Email delivery failed: ${error.message}`);
  }

  logger.info({ to }, "Password reset email sent via Resend");
}

export async function sendAccountSetupEmail(opts: {
  to: string;
  name: string;
  setupUrl: string;
  expiresHours: number;
}): Promise<void> {
  const { to, name, setupUrl, expiresHours } = opts;
  const resend = getResendClient();

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject: "Set up your SwiftMart account",
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Set up your account</title>
</head>
<body style="margin:0;padding:0;background:#0d0d0d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d0d;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#1a1a1a;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="background:#b45309;padding:28px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">SwiftMart</h1>
              <p style="margin:6px 0 0;color:#fde68a;font-size:13px;">10-minute delivery</p>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 32px;">
              <h2 style="margin:0 0 12px;color:#f5f5f5;font-size:20px;font-weight:600;">Welcome, ${name}!</h2>
              <p style="margin:0 0 24px;color:#a3a3a3;font-size:15px;line-height:1.6;">
                An admin has set up a SwiftMart account for you. Click the button below to create your password and start ordering.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 28px;">
                    <a href="${setupUrl}"
                       style="display:inline-block;background:#b45309;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 32px;border-radius:10px;">
                      Set up my account
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;color:#737373;font-size:13px;line-height:1.5;">
                This link expires in <strong style="color:#a3a3a3;">${expiresHours} hours</strong>.
                If you didn't expect this email, you can safely ignore it.
              </p>
              <div style="background:#262626;border-radius:8px;padding:14px;margin-top:20px;">
                <p style="margin:0 0 6px;color:#737373;font-size:12px;">Or copy this link into your browser:</p>
                <p style="margin:0;color:#b45309;font-size:12px;word-break:break-all;">${setupUrl}</p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="border-top:1px solid #262626;padding:20px 32px;text-align:center;">
              <p style="margin:0;color:#525252;font-size:12px;">
                © ${new Date().getFullYear()} SwiftMart · This is an automated message, please do not reply.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    text: `Welcome to SwiftMart, ${name}!\n\nAn admin has set up an account for you. Click this link to create your password (expires in ${expiresHours} hours):\n${setupUrl}\n\nIf you didn't expect this, ignore this email.`,
  });

  if (error) {
    logger.error({ error, to }, "Resend failed to send account setup email");
    throw new Error(`Email delivery failed: ${error.message}`);
  }

  logger.info({ to }, "Account setup email sent via Resend");
}
