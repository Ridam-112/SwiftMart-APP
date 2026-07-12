import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import WS from "ws";

// supabase-js's realtime client expects a global WebSocket, which Node 20
// doesn't provide (stable only from Node 22+). Polyfill it so createClient()
// doesn't throw — we only use Storage, never realtime, but the constructor
// checks for WebSocket eagerly.
if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as unknown as { WebSocket: typeof WS }).WebSocket = WS;
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const SUPABASE_BUCKET = "swiftmart-uploads";

let client: ReturnType<typeof createClient> | null = null;
let bucketEnsured = false;

function getClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase Storage is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing)");
  }
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
  }
  return client;
}

/** Create the storage bucket if it doesn't exist yet (idempotent, cached per process). */
async function ensureBucket(): Promise<void> {
  if (bucketEnsured) return;
  const supabase = getClient();
  const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
  if (listErr) throw new Error(`Supabase Storage error: ${listErr.message}`);
  const exists = buckets?.some((b) => b.name === SUPABASE_BUCKET);
  if (!exists) {
    const { error: createErr } = await supabase.storage.createBucket(SUPABASE_BUCKET, {
      public: true,
      fileSizeLimit: "10MB",
    });
    if (createErr && !/already exists/i.test(createErr.message)) {
      throw new Error(`Failed to create Supabase bucket: ${createErr.message}`);
    }
  }
  bucketEnsured = true;
}

function extensionFromMime(mimeType: string): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "application/pdf") return "pdf";
  return "bin";
}

/**
 * Upload a buffer to Supabase Storage.
 *
 * @param buffer   - File buffer to upload.
 * @param folder   - Storage folder path (e.g. "swiftmart/products").
 * @param mimeType - Original file MIME type, used for content-type and extension.
 */
export async function uploadToSupabase(
  buffer: Buffer,
  folder: string,
  mimeType: string,
): Promise<{ url: string; path: string }> {
  await ensureBucket();
  const supabase = getClient();

  const ext = extensionFromMime(mimeType);
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from(SUPABASE_BUCKET).upload(path, buffer, {
    contentType: mimeType,
    upsert: false,
  });
  if (error) throw new Error(`Supabase upload failed: ${error.message}`);

  const { data } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

/** Detect whether a URL points to our Supabase Storage bucket. */
export function isSupabaseUrl(url: string): boolean {
  return Boolean(SUPABASE_URL) && url.startsWith(`${SUPABASE_URL}/storage/`);
}

/** Extract the storage object path from a Supabase public URL. */
function extractSupabasePath(url: string): string | null {
  const marker = `/object/public/${SUPABASE_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}

export async function deleteFromSupabase(imageUrl: string): Promise<void> {
  if (!imageUrl || !isSupabaseUrl(imageUrl)) return;
  const path = extractSupabasePath(imageUrl);
  if (!path) return;
  try {
    const supabase = getClient();
    await supabase.storage.from(SUPABASE_BUCKET).remove([path]);
  } catch {
    // non-fatal — log silently, mirrors Cloudinary delete behavior
  }
}
