import * as FileSystem from 'expo-file-system/legacy';
import { UPLOAD_URL } from './api';

/**
 * Uploads a local image (picked via expo-image-picker or camera) to
 * Supabase Storage through our api-server, and returns the public URL.
 *
 * New uploads always go to Supabase storage (matching the website).
 * Existing images already stored on Cloudinary keep working as-is —
 * this helper is only used for new uploads going forward.
 */
export async function uploadImage(
  localUri: string,
  options?: { folder?: string; mimeType?: string },
): Promise<string> {
  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const mimeType = options?.mimeType ?? guessMimeType(localUri);
  const folder = options?.folder ?? 'uploads';

  const res = await fetch(UPLOAD_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base64, mimeType, folder }),
  });

  if (!res.ok) {
    let message = 'Image upload failed';
    try {
      const err = await res.json();
      message = err.message || message;
    } catch {}
    throw new Error(message);
  }

  const data = await res.json();
  return data.url as string;
}

function guessMimeType(uri: string): string {
  const ext = uri.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'jpg':
    case 'jpeg':
    default:
      return 'image/jpeg';
  }
}
