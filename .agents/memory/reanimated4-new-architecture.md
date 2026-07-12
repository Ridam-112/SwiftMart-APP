---
name: Reanimated 4 requires New Architecture
description: react-native-reanimated@4.x (with react-native-worklets) hard-fails the Android Gradle build if New Architecture is disabled.
---

`react-native-reanimated@4.x` (paired with `react-native-worklets`) mandates React Native's New Architecture (Fabric/TurboModules). Its Gradle build has an explicit `assertNewArchitectureEnabledTask` check that fails the build with:

> [Reanimated] Reanimated requires new architecture to be enabled. Please enable it by setting `newArchEnabled` to `true` in `gradle.properties`.

**Why:** Reanimated 3.x supported both old and new architecture; Reanimated 4 dropped old-architecture support entirely.

**How to apply:** If a project depends on Reanimated 4+, `newArchEnabled` in `app.json`/`app.config` must stay `true` — do not flip it to `false` as a workaround for unrelated compatibility concerns (e.g. targeting older Android versions via `minSdkVersion`). New Architecture and a lower `minSdkVersion` are independent settings and can coexist. If old-architecture is truly required, downgrade to Reanimated 3.x instead of disabling New Arch.
