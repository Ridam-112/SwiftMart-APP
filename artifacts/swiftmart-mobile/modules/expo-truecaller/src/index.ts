import { NativeModule, requireNativeModule } from 'expo';

export interface TruecallerProfile {
  phoneNumber: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  accessToken: string;
  requestNonce?: string;
}

interface ExpoTruecallerModule extends NativeModule {
  isUsable(): Promise<boolean>;
  initialize(appKey: string): Promise<void>;
  requestProfile(): Promise<TruecallerProfile>;
}

// This custom native module currently has no bundled Android implementation.
// `requireNativeModule` throws synchronously if the native side isn't linked,
// and since this file is pulled into the single JS bundle at app startup,
// an unguarded call here would crash the whole app before any UI renders.
// Resolve it lazily and swallow the error so the rest of the app keeps working
// (Truecaller sign-in simply reports itself as unavailable).
let cachedModule: ExpoTruecallerModule | null | undefined;
function getModule(): ExpoTruecallerModule | null {
  if (cachedModule === undefined) {
    try {
      cachedModule = requireNativeModule<ExpoTruecallerModule>('ExpoTruecaller');
    } catch {
      cachedModule = null;
    }
  }
  return cachedModule;
}

export async function isTruecallerUsable(): Promise<boolean> {
  const mod = getModule();
  if (!mod) return false;
  try {
    return await mod.isUsable();
  } catch {
    return false;
  }
}

export async function initializeTruecaller(appKey: string): Promise<void> {
  const mod = getModule();
  if (!mod) throw new Error('Truecaller is not available on this build.');
  await mod.initialize(appKey);
}

export async function requestTruecallerProfile(): Promise<TruecallerProfile> {
  const mod = getModule();
  if (!mod) throw new Error('Truecaller is not available on this build.');
  return mod.requestProfile();
}
