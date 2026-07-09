---
name: EAS Build + pnpm monorepo lockfile incompatibility
description: Why `eas build` fails with "Ignoring not compatible lockfile" / ERR_PNPM_NO_LOCKFILE even though pnpm-lock.yaml is committed, and the fix.
---

EAS Build's cloud image installs deps via Corepack, which picks a pnpm
version independent of what generated the local lockfile. If the root
`package.json` has no `packageManager` field, Corepack/pnpm on the build
image can resolve to a pnpm major version that doesn't understand the
lockfile's `lockfileVersion` (e.g. `9.0`), silently treats it as
incompatible, and `--frozen-lockfile` then fails as if the lockfile were
missing entirely — even though it's present and correctly committed.

**Why:** Corepack only pins the exact package manager version when
`packageManager` is declared in the workspace root `package.json`. Without
it, EAS's build image pnpm version can drift from the one used to generate
`pnpm-lock.yaml` locally on Replit.

**How to apply:** For any Expo/pnpm-workspace project targeting EAS Build,
ensure the workspace root `package.json` has `"packageManager": "pnpm@<exact
version>"` matching the version that generated the committed lockfile (check
via `pnpm --version` in the dev environment). This is a config fix only —
agents must not run or suggest `eas build`/`eas init`/etc. commands
themselves (see expo skill); only fix the underlying repo config.
