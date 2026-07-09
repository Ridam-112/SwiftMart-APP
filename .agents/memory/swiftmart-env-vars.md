---
name: SwiftMart env vars
description: Which secrets are required for each SwiftMart feature, and what breaks when they're missing.
---

## API server secrets

| Secret | Required for | Fails if missing |
|--------|-------------|------------------|
| `PORT` | API server startup | Crashes on start (hard error) |
| `DATABASE_URL` | Drizzle DB (push tokens, broadcast sync cursor table) | Crashes on import of `@workspace/db` |
| `NEON_DATABASE_URL` | `/api/db/hero-banners`, `/api/db/categories`, `/api/db/homepage-sections`, broadcast sync poller | Routes return 503; broadcast sync silently skips (null-safe guard added) |
| `SUPABASE_URL` | `/api/upload` image uploads | Route returns 503 |
| `SUPABASE_ANON_KEY` | `/api/upload` image uploads | Route returns 503 |
| `SUPABASE_BUCKET` | Upload bucket name (optional, defaults to `swiftmart-image`) | Uses default |

## Mobile (Expo) env vars

| Var | Required for | Source |
|-----|-------------|--------|
| `EXPO_PUBLIC_DOMAIN` | API proxy base URL on web; also used for DB/upload/notification URLs | Injected by workflow script via `$REPLIT_DEV_DOMAIN` |
| `EXPO_PUBLIC_REPL_ID` | Push notification registration | Injected by workflow |

**Why:**
- Production API (`https://swiftmart.space/api`) blocks browser origins with CORS 500s, so on web the app routes all calls through the local api-server proxy at `https://${EXPO_PUBLIC_DOMAIN}/api/proxy/…`. Native builds call the production API directly.
- `DATABASE_URL` is consumed at module load time by `@workspace/db` — missing it crashes the api-server before any route runs.

**How to apply:**
- When the API server crashes on startup, check `DATABASE_URL` first.
- When `/api/db/*` returns 503, check `NEON_DATABASE_URL`.
- When image upload fails, check `SUPABASE_URL` + `SUPABASE_ANON_KEY`.
