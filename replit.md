# SwiftMart

A hyperlocal grocery/retail delivery platform — multi-sided marketplace connecting customers with local shops, vendors, delivery partners, and admins.

## Run & Operate

- **Expo app:** running via the `artifacts/swiftmart-mobile: expo` workflow (`pnpm --filter @workspace/swiftmart-mobile run dev`), registered as an artifact at preview path `/swiftmart-mobile/`. Verified working (login screen renders, no errors).
- **API server:** running via the `artifacts/api-server: API Server` workflow. This is **not** unused boilerplate — on web, the Expo app's `lib/api.ts` routes all backend calls through this server's `/api/proxy/*` route (see `artifacts/api-server/src/routes/proxy.ts`), because the production backend's CORS policy blocks the Replit preview origin. Native (iOS/Android) builds skip the proxy and call the production backend directly. Both workflows must run together for the web preview to work end-to-end.
- `artifacts/mockup-sandbox` — Canvas design-preview sandbox, auto-registered from the import, not actively used; left stopped.

## Stack (Expo app)

- **Framework:** Expo Router (file-based routing under `artifacts/swiftmart-mobile/app/`), React Native 0.81, React 19
- **Data:** `@tanstack/react-query` + `@workspace/api-client-react`
- **Storage:** `@react-native-async-storage/async-storage` (JWT token + user cache)
- **Auth:** `context/AuthContext.tsx` — email/password login & registration; roles: customer, vendor, rider
- **Screens:** role-based route groups — `(customer)`, `(vendor)`, `(rider)`, plus shared `login`, `register`, `checkout`, `shop/[id]`, `order/[id]`

## Backend API

Live production API: **`https://swiftmart.space/api`**

The Expo app is a **frontend only** — there is no app-owned backend; `artifacts/api-server` is a thin proxy, not the real backend. Native (iOS/Android) builds call the production API directly (`lib/api.ts`). On **web**, browser requests instead go through `artifacts/api-server`'s `/api/proxy/*` route, which forwards them server-to-server to production — this sidesteps the production backend's CORS policy, which blocks the Replit preview origin. Both the Expo and API Server workflows must be running for the web preview to work end-to-end.

Demo credentials:
| Role | Email | Password |
|------|-------|----------|
| Customer | priya.sharma@swiftmart.in | Swift@2026 |
| Vendor | rahul.vendor@swiftmart.in | Swift@2026 |
| Rider | arjun.rider@swiftmart.in | Swift@2026 |

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Pointers

- Full PRD with all API endpoints is in `attached_assets/` text files
<!-- This is a single-line comment -->

