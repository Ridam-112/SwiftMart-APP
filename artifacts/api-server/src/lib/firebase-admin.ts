import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

// Prefer a single FIREBASE_SERVICE_ACCOUNT JSON blob (already used elsewhere in
// this project for FCM) over three separate fields, but support both.
function resolveCredential(): { projectId: string; clientEmail: string; privateKey: string } | null {
  if (process.env["FIREBASE_SERVICE_ACCOUNT"]) {
    try {
      const sa = JSON.parse(process.env["FIREBASE_SERVICE_ACCOUNT"]) as {
        project_id?: string; client_email?: string; private_key?: string;
      };
      if (sa.project_id && sa.client_email && sa.private_key) {
        return { projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key };
      }
    } catch {
      console.warn("[FCM] FIREBASE_SERVICE_ACCOUNT is set but is not valid JSON");
    }
  }

  const projectId = process.env["FIREBASE_PROJECT_ID"] ?? process.env["VITE_FIREBASE_PROJECT_ID"] ?? "";
  const clientEmail = process.env["FIREBASE_CLIENT_EMAIL"] ?? "";
  // Strip surrounding quotes, convert \n escapes, then extract only the PEM block
  // (handles cases where extra text was accidentally pasted around the key)
  const _rawKey = (process.env["FIREBASE_PRIVATE_KEY"] ?? "")
    .replace(/^["']|["']$/g, "")
    .replace(/\\n/g, "\n");
  const _pemMatch = _rawKey.match(/-----BEGIN PRIVATE KEY-----[\s\S]+?-----END PRIVATE KEY-----/);
  const privateKey = _pemMatch ? _pemMatch[0] : _rawKey;

  if (!projectId || !clientEmail || !privateKey) return null;
  return { projectId, clientEmail, privateKey };
}

let _ready = false;

function ensureInit(): boolean {
  if (_ready) return true;
  const creds = resolveCredential();
  if (!creds) {
    console.warn(
      "[FCM] Firebase Admin SDK not configured — " +
      "set FIREBASE_SERVICE_ACCOUNT (or FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY) to enable push notifications."
    );
    return false;
  }
  try {
    if (getApps().length === 0) {
      initializeApp({ credential: cert(creds) });
    }
    _ready = true;
    console.log("[FCM] Firebase Admin SDK initialized (project:", creds.projectId, ")");
    return true;
  } catch (err) {
    console.error("[FCM] initializeApp failed:", err);
    return false;
  }
}

export function getMessagingInstance() {
  if (!ensureInit()) return null;
  try {
    return getMessaging();
  } catch (err) {
    console.error("[FCM] getMessaging failed:", err);
    return null;
  }
}
