---
name: EAS monorepo project root confusion
description: Stray app.json/eas.json at the pnpm workspace root can hijack EAS Build, making it treat the whole monorepo as the Expo project instead of the app subdirectory.
---

If a pnpm/yarn monorepo has multiple artifacts (e.g. an Expo app plus other services) and an `app.json`/`eas.json` pair exists at the **workspace root** in addition to the real ones inside the Expo app's subdirectory, EAS CLI can resolve the project root to the repo root when `eas build` is invoked from there (or from ambiguous CWDs).

**Why:** When the repo root is treated as the Expo project root, `expo` isn't a dependency there (it's scoped to the app subdirectory), so `pnpm expo prebuild ...` fails with "Command 'expo' not found" / `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL`. It can also cause a mismatched/wrong `projectId` or Android package to be picked up.

**How to apply:** Per Expo's official monorepo guidance, `eas.json` and `app.json`/`app.config` should exist only inside the actual app directory (one copy per app if there are several). Always run `eas build`/`eas init`/`eas submit` from inside that app directory (e.g. `cd artifacts/<mobile-app> && eas build ...`), never from the monorepo root. If a root-level `app.json`/`eas.json` is found and isn't the real project, delete it.
