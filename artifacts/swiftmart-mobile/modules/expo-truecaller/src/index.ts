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

const ExpoTruecallerModule = requireNativeModule<ExpoTruecallerModule>('ExpoTruecaller');

export async function isTruecallerUsable(): Promise<boolean> {
  try {
    return await ExpoTruecallerModule.isUsable();
  } catch {
    return false;
  }
}

export async function initializeTruecaller(appKey: string): Promise<void> {
  await ExpoTruecallerModule.initialize(appKey);
}

export async function requestTruecallerProfile(): Promise<TruecallerProfile> {
  return ExpoTruecallerModule.requestProfile();
}
