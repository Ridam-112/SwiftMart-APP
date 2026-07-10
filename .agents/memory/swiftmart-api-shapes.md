---
name: SwiftMart API response shapes
description: Field-name and endpoint quirks for the SwiftMart production API (swiftmart.space/api).
---

- Single-resource endpoints wrap in `{shop:…}`/`{product:…}`; field names differ (`shopName` not `name`, `banner` not `coverImage`, `images[]` not `image`).
- `/shops/:id/products` is invalid — use `/products?shopId=:id`.
- Registration is `POST /auth/signup`, **not** `/auth/register` (that path 404s). Login is `POST /auth/login` with `{phone, password}` (not email). Both return `{success, accessToken, refreshToken, user}` directly (no nested `data` wrapper) — `user.email` comes back as `""` even if a real email was submitted at signup.
- `/auth/signup` has an aggressive per-IP rate limit ("Too many signup attempts. Please wait 15 minutes") that triggers after only a few attempts — do not loop signup calls while debugging; verify logic against a single real call, then reason about the rest statically.
