---
name: SwiftMart API response shapes
description: How the production API wraps responses and which field names differ from the app's TypeScript types.
---

## Single-resource endpoints wrap in a named key
- `GET /shops/:id` → `{ success, shop: { shopName, banner, id, ... } }`
- `GET /products/:id` → `{ success, product: { images[], shopId, shopName, ... } }`
- Extract with: `res.shop ?? res` / `res.product ?? res` before normalizing.

## List endpoints embed array under a named key
- `GET /shops` → `{ success, shops: [...] }` — use `extractList(res, 'shops')`
- `GET /products` → `{ success, products: [...] }` — use `extractList(res, 'products')`
- `GET /products?shopId=:id` → `{ success, products: [...] }` — correct way to load shop products

## Field name mismatches (API → app type)
| API field | App type field | Fixed by |
|-----------|---------------|---------|
| `shopName` | `name` | `normalizeShop()` in `lib/api.ts` |
| `banner` | `coverImage` | `normalizeShop()` |
| `id` | `_id` | `normalizeShop()` (both present) |
| `images[]` | `image` (singular) | `ProductCard` reads `images?.[0] \|\| image` |

## Invalid endpoints
- `GET /shops/:id/products` — returns HTML (404/redirect) without auth. **Do not use.**
  Use `GET /products?shopId=:id` instead.

**Why:** The production backend uses `shopName` (not `name`) and wraps single-resource
responses. All fetch sites must unwrap + normalize before using the data.

**How to apply:** Any new fetch of a shop or product must call `normalizeShop` /
extract `res.product ?? res` before assigning to typed variables.
