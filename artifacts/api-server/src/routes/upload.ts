import { Router, Request } from "express";
import { logger } from "../lib/logger";
import { requireAuth } from "../lib/auth";

const router = Router();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET ?? "swiftmart-image";

// Only allow known-safe image types, checked against both the declared
// mimeType and the file's actual magic bytes (never trust the client).
const ALLOWED_TYPES: Record<string, (buf: Buffer) => boolean> = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  "image/webp": (b) => b.slice(0, 4).toString("ascii") === "RIFF" && b.slice(8, 12).toString("ascii") === "WEBP",
};
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB
// Restrict where uploads can land — no client-controlled arbitrary paths.
const ALLOWED_FOLDERS = new Set(["uploads", "avatars", "products", "shops"]);

/**
 * POST /api/upload
 * Requires an authenticated user. Accepts a base64-encoded image and
 * uploads it to Supabase Storage under a server-generated path. Returns
 * the public URL.
 *
 * Body (JSON): { base64: string, mimeType: string, folder?: string }
 */
router.post("/", requireAuth, async (req: Request, res) => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(503).json({ success: false, message: "Storage not configured" });
  }

  const { base64, mimeType, folder = "uploads" } = req.body as {
    base64: string;
    mimeType: string;
    folder?: string;
  };

  if (!base64 || !mimeType) {
    return res.status(400).json({ success: false, message: "base64 and mimeType are required" });
  }
  const signatureCheck = ALLOWED_TYPES[mimeType];
  if (!signatureCheck) {
    return res.status(400).json({ success: false, message: "Unsupported image type" });
  }
  if (!ALLOWED_FOLDERS.has(folder)) {
    return res.status(400).json({ success: false, message: "Invalid folder" });
  }

  try {
    const buffer = Buffer.from(base64, "base64");

    if (buffer.length === 0 || buffer.length > MAX_UPLOAD_BYTES) {
      return res.status(400).json({ success: false, message: "Image must be under 5MB" });
    }
    if (!signatureCheck(buffer)) {
      return res.status(400).json({ success: false, message: "File content does not match declared type" });
    }

    // Server-generated filename only — never trust a client-provided name/path.
    const ext = mimeType.split("/")[1];
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const path = `${folder}/${name}`;

    const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET}/${path}`;
    const uploadRes = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": mimeType,
        // No upsert: uploads never overwrite existing objects since the
        // filename is server-generated and unique.
      },
      body: buffer,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      logger.error({ status: uploadRes.status, errText }, "Supabase upload failed");
      return res.status(502).json({ success: false, message: "Upload to storage failed" });
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${path}`;
    return res.json({ success: true, url: publicUrl, path });
  } catch (err) {
    logger.error({ err }, "Upload route error");
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

export default router;
