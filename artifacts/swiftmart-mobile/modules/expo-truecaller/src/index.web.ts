// Truecaller SDK is not available on web — provide a typed stub so the
// app compiles and can show a graceful "not supported" message.
export interface TruecallerProfile {
  phoneNumber: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  accessToken: string;
  requestNonce?: string;
}

export async function isTruecallerUsable(): Promise<boolean> {
  return false;
}

export async function initializeTruecaller(_appKey: string): Promise<void> {
  // no-op on web
}

export async function requestTruecallerProfile(): Promise<TruecallerProfile> {
  throw new Error('Truecaller is only available on Android devices with Truecaller installed.');
}
