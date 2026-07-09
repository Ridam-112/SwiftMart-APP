---
name: Cart quantity decrement anti-pattern
description: A recurring bug pattern where a cart "remove one" handler mistakenly re-calls addItem instead of decrementing, which increments quantity instead.
---

A recurring bug in this codebase's cart UIs: the "minus/remove one" button
handler was written as `if (qty <= 1) removeItem(id); else addItem({...product}, shopId)`.
Since `addItem` always increments the quantity, tapping "-" above quantity 1
actually increased it instead of decreasing it. Found independently in three
screens (`app/product/[id].tsx`, `app/search.tsx`, `app/shop/[id].tsx`) — it
was a copy-pasted pattern, not an isolated typo.

**Why:** `CartContext` exposes a dedicated `updateQuantity(productId, quantity)`
that already handles the `quantity <= 0 → removeItem` case internally. Any
decrement handler that doesn't call it (and instead re-derives increment logic
via `addItem`) is almost certainly wrong.

**How to apply:** Any new "remove one" / stepper "-" button in this app should
call `updateQuantity(productId, currentQty - 1)` and nothing else. If you see
`else addItem(...)` inside a decrement/remove handler anywhere in the codebase,
treat it as a bug and fix it the same way.
