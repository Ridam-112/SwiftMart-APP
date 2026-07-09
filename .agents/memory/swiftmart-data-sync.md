---
    name: SwiftMart Neon/Supabase data sync
    description: How the mobile app stays in sync with the swiftmart.space website's data and images
    ---

    - The api-server (artifacts/api-server) has a second DB connection, separate from the monorepo's own `@workspace/db` (which uses the Replit-managed `DATABASE_URL`). It connects directly to the website's Neon Postgres via the `NEON_DATABASE_URL` secret, exposed under `/api/db/*` (hero-banners, homepage-sections, categories).
    - **Why:** the website admin panel writes hero banners/content straight to Neon; the old flow only proxied to swiftmart.space/api, which didn't expose an endpoint for banner content, so the app's banner was hardcoded. Reading Neon directly keeps the app in sync without needing an upstream API change.
    - Image uploads: `/api/upload` on the api-server pushes new images to Supabase Storage (bucket in `SUPABASE_BUCKET` env var, project in `SUPABASE_URL`, auth via `SUPABASE_ANON_KEY` secret) and returns a public URL. Existing images (already on Cloudinary, cloud name `dpzdtsfd3`) are left as-is — only new uploads go to Supabase, matching the website's current behavior.
    - **How to apply:** the upload route requires an authenticated bearer token (validated by pinging swiftmart.space's `/users/me/profile`), enforces a strict image-type allowlist checked against real file signature bytes (not just declared mimeType), a 5MB cap, and always generates its own filename/path — never trust client-provided folder or filename for storage writes.
    - Mobile app must always resolve `DB_BASE_URL`/`UPLOAD_URL` to this project's own api-server domain on every platform (web and native) — never fall back to `swiftmart.space/api`, which has no `/db` or `/upload` routes.
    