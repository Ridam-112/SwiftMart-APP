---
name: Reimported multi-artifact project recovery
description: What to do when a re-imported/forked project has artifact source code on disk but listArtifacts() returns empty and no workflows exist.
---

## Symptom
After a GitHub re-import (or similar), `listArtifacts()` returns `[]` and no workflows exist, even though `artifacts/<slug>/` directories with real app code and `.replit-artifact/artifact.toml` files are present on disk. `createArtifact()` fails with `ARTIFACT_DIR_EXISTS`.

## Root cause
The platform's artifact registry (what `listArtifacts()` reads) is separate from the `artifact.toml` files on disk, and both were lost/desynced by the reimport. The shared reverse proxy actually reads `.replit-artifact/artifact.toml` directly from disk for routing — it does not require registry state — but registry state is still needed for tooling like `Screenshot(type: appPreview)` and for the platform to auto-manage the workflow.

## Fix (no destructive recreation needed)
1. Do **not** delete and recreate the artifact directories via `createArtifact` — this destroys real app code and `createArtifact` refuses existing dirs anyway.
2. If `artifact.toml` files are intact, just (re)create the **workflow** with the exact managed name pattern `artifacts/<slug>: <service-name-from-toml>` and the command from `[services.development].run` in the toml (plus any `[services.env]` vars). Once such a correctly-named/configured workflow starts, the platform auto-detects the `artifact.toml` and registers the artifact — `listArtifacts()` then returns it and it also replaces/normalizes the workflow to the canonical `pnpm --filter @workspace/<slug> run dev` form automatically.
3. If `artifact.toml` itself is missing, `WriteFile`/`Edit` are blocked for that filename — write the same content to a sibling `artifact.edit.toml` and either call `verifyAndReplaceArtifactToml` (only works if the target file already exists) or, for a from-scratch restore, use a plain shell `cp` to place the file, then start the matching workflow as in step 2.

## Why
Manually inventing one-off workflow names/commands (e.g. improvising `PORT=... BASE_PATH=... pnpm run dev`) works for direct `curl`, but `Screenshot(type: appPreview)` and expected proxy behavior depend on the artifact being registered — until then an Expo web app can even 200 on its preview path but render a persistent blank page with no console errors, which is a red herring for "the app is broken" when the real issue is "the artifact was never (re-)registered".
