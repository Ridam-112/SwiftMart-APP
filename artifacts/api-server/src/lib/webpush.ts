import webpush from "web-push";

// Alias: this project stores the public VAPID key as FIREBASE_VAPID_KEY.
const publicKey  = process.env["VAPID_PUBLIC_KEY"] ?? process.env["FIREBASE_VAPID_KEY"] ?? "";
// Convert standard Base64 → URL-safe Base64 (VAPID requires URL-safe, no padding)
const privateKey = (process.env["VAPID_PRIVATE_KEY"] ?? "")
  .replace(/\+/g, "-")
  .replace(/\//g, "_")
  .replace(/=+$/, "");
const subject    = process.env["VAPID_SUBJECT"]      ?? "mailto:admin@swiftmart.com";

if (publicKey && privateKey) {
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
  } catch (err) {
    console.warn("[webpush] VAPID key configuration failed — push notifications will be disabled:", (err as Error).message);
  }
}

export { webpush, publicKey as vapidPublicKey };
