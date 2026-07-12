import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

/**
 * Upload a buffer to Cloudinary.
 *
 * @param buffer       - File buffer to upload.
 * @param folder       - Cloudinary folder (e.g. "swiftmart/products").
 * @param resourceType - "image" for photos (default), "auto" for mixed
 *                       content like certificates that may be PDF or image.
 *                       Using "auto" lets Cloudinary detect the type; PDFs
 *                       are stored as "raw" and images as "image".
 */
export function uploadToCloudinary(
  buffer: Buffer,
  folder: string,
  resourceType: "image" | "auto" | "raw" = "image",
  timeoutMs = 30_000,
): Promise<{ url: string; publicId: string; resourceType: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Cloudinary upload timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);

    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: resourceType },
      (error, result) => {
        clearTimeout(timer);
        if (error || !result) return reject(error ?? new Error("Cloudinary upload failed"));
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          resourceType: result.resource_type,
        });
      },
    );
    stream.end(buffer);
  });
}

export function extractPublicId(cloudinaryUrl: string): string | null {
  const match = cloudinaryUrl.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-zA-Z0-9]+$/);
  return match?.[1] ?? null;
}

/**
 * Detect whether a Cloudinary URL points to a raw (PDF) asset.
 * Raw assets are served under /raw/upload/ instead of /image/upload/.
 */
function isRawUrl(url: string): boolean {
  return url.includes("/raw/upload/");
}

export async function deleteFromCloudinary(imageUrl: string): Promise<void> {
  if (!imageUrl) return;
  if (imageUrl.startsWith("/api/uploads/")) return;
  if (!imageUrl.includes("cloudinary.com")) return;
  const publicId = extractPublicId(imageUrl);
  if (!publicId) return;
  try {
    // PDFs are stored as "raw" resource type; images as "image".
    // Using the wrong type silently no-ops, so detect from the URL.
    const resourceType = isRawUrl(imageUrl) ? "raw" : "image";
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  } catch {
    // non-fatal — log silently
  }
}

export { cloudinary };
