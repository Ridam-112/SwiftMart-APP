import { deleteFromCloudinary } from "./cloudinary.js";
import { deleteFromSupabase, isSupabaseUrl } from "./supabase.js";

/**
 * Delete an uploaded file regardless of which provider it lives on.
 * New uploads go to Supabase Storage; older records may still point at
 * Cloudinary, so this dispatches based on the URL shape.
 */
export async function deleteImage(url: string): Promise<void> {
  if (!url) return;
  if (isSupabaseUrl(url)) {
    await deleteFromSupabase(url);
  } else {
    await deleteFromCloudinary(url);
  }
}
