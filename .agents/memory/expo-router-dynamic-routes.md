---
name: Expo Router dynamic segment conflicts
description: Why new dynamic-route features should get distinct top-level paths rather than nesting under an existing [id] segment.
---

When adding new screens that take a dynamic id (e.g. order tracking, an active
delivery view, a product detail page) in an Expo Router app that already has
other `[id]` routes (e.g. `shop/[id]`, `order/[id]`), give each new feature its
own top-level path (`tracking/[id]`, `rider-delivery/[id]`, `product/[id]`)
instead of trying to nest it under an existing `[id]` segment or reuse the same
folder.

**Why:** Expo Router resolves routes by file path; reusing a segment name across
unrelated features (or nesting a second dynamic segment under an existing one)
produces ambiguous/conflicting route matches that are hard to debug later.

**How to apply:** Before adding a new dynamic route, check `app/_layout.tsx` and
the `app/` tree for existing `[id]` folders. Pick a distinct top-level folder
name per feature and register it explicitly as its own `Stack.Screen` in
`_layout.tsx`.
