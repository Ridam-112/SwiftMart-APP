import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import path from "path";
import { authenticate } from "../../middlewares/auth.js";
import { uploadToSupabase } from "../../lib/supabase.js";


const router = Router();

// ─── POST /api/upload (legacy mobile-app compatibility) ───────────────────────
// The mobile app's lib/upload.ts posts a base64-encoded image as JSON to the
// bare /api/upload root (no sub-path). Keep accepting that shape here so the
// app doesn't need to switch to multipart/form-data uploads.
const LEGACY_ALLOWED_TYPES: Record<string, (buf: Buffer) => boolean> = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  "image/webp": (b) => b.slice(0, 4).toString("ascii") === "RIFF" && b.slice(8, 12).toString("ascii") === "WEBP",
};
const LEGACY_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const LEGACY_ALLOWED_FOLDERS = new Set(["uploads", "avatars", "products", "shops"]);

router.post("/", authenticate, async (req: Request, res: Response): Promise<void> => {
  const { base64, mimeType, folder = "uploads" } = req.body as {
    base64?: string;
    mimeType?: string;
    folder?: string;
  };

  if (!base64 || !mimeType) {
    res.status(400).json({ success: false, message: "base64 and mimeType are required" });
    return;
  }
  const signatureCheck = LEGACY_ALLOWED_TYPES[mimeType];
  if (!signatureCheck) {
    res.status(400).json({ success: false, message: "Unsupported image type" });
    return;
  }
  if (!LEGACY_ALLOWED_FOLDERS.has(folder)) {
    res.status(400).json({ success: false, message: "Invalid folder" });
    return;
  }

  try {
    const buffer = Buffer.from(base64, "base64");
    if (buffer.length === 0 || buffer.length > LEGACY_MAX_UPLOAD_BYTES) {
      res.status(400).json({ success: false, message: "Image must be under 5MB" });
      return;
    }
    if (!signatureCheck(buffer)) {
      res.status(400).json({ success: false, message: "File content does not match declared type" });
      return;
    }
    const { url } = await uploadToSupabase(buffer, `swiftmart/${folder}`, mimeType);
    res.json({ success: true, url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upload failed";
    res.status(502).json({ success: false, message: msg });
  }
});

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [".jpg", ".jpeg", ".png", ".webp"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error("Only JPG, PNG, or WEBP images are allowed"));
  },
});

const certificateUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [".jpg", ".jpeg", ".png", ".webp", ".pdf"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error("Only JPG, PNG, WEBP, or PDF files are allowed"));
  },
});

/**
 * Run a multer middleware as a promise so errors are caught inline
 * instead of bubbling to Express's global error handler (which returns 500).
 */
function runMulter(
  middleware: (req: Request, res: Response, next: NextFunction) => void,
  req: Request,
  res: Response,
): Promise<void> {
  return new Promise((resolve, reject) => {
    middleware(req, res, (err: unknown) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

router.post(
  "/product-image",
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      await runMulter(imageUpload.single("image"), req, res);
    } catch (err) {
      const isMulterLimit = err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE";
      const msg = isMulterLimit
        ? "Image is too large. Maximum size is 5 MB."
        : err instanceof Error ? err.message : "Invalid file";
      res.status(400).json({ success: false, message: msg });
      return;
    }

    if (!req.file) {
      res.status(400).json({ success: false, message: "No file uploaded" });
      return;
    }

    try {
      const { url } = await uploadToSupabase(req.file.buffer, "swiftmart/products", req.file.mimetype);
      res.json({ success: true, imageUrl: url });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      res.status(502).json({ success: false, message: msg });
    }
  },
);

router.post(
  "/banner-image",
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      await runMulter(imageUpload.single("image"), req, res);
    } catch (err) {
      const isMulterLimit = err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE";
      const msg = isMulterLimit
        ? "Image is too large. Maximum size is 5 MB."
        : err instanceof Error ? err.message : "Invalid file";
      res.status(400).json({ success: false, message: msg });
      return;
    }

    if (!req.file) {
      res.status(400).json({ success: false, message: "No file uploaded" });
      return;
    }

    try {
      const { url } = await uploadToSupabase(req.file.buffer, "swiftmart/banners", req.file.mimetype);
      res.json({ success: true, imageUrl: url });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      res.status(502).json({ success: false, message: msg });
    }
  },
);

router.post(
  "/shop-image",
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      await runMulter(imageUpload.single("image"), req, res);
    } catch (err) {
      const isMulterLimit = err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE";
      const msg = isMulterLimit
        ? "Image is too large. Maximum size is 5 MB."
        : err instanceof Error ? err.message : "Invalid file";
      res.status(400).json({ success: false, message: msg });
      return;
    }

    if (!req.file) {
      res.status(400).json({ success: false, message: "No file uploaded" });
      return;
    }

    try {
      const { url } = await uploadToSupabase(req.file.buffer, "swiftmart/shops", req.file.mimetype);
      res.json({ success: true, imageUrl: url });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      res.status(502).json({ success: false, message: msg });
    }
  },
);

router.post(
  "/certificate",
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    try {
      await runMulter(certificateUpload.single("file"), req, res);
    } catch (err) {
      const isMulterLimit = err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE";
      const msg = isMulterLimit
        ? "File is too large. Maximum size is 10 MB."
        : err instanceof Error ? err.message : "Invalid file";
      res.status(400).json({ success: false, message: msg });
      return;
    }

    if (!req.file) {
      res.status(400).json({ success: false, message: "No file uploaded" });
      return;
    }

    try {
      const { url } = await uploadToSupabase(req.file.buffer, "swiftmart/certificates", req.file.mimetype);
      res.json({ success: true, fileUrl: url });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      res.status(502).json({ success: false, message: msg });
    }
  },
);

export default router;
