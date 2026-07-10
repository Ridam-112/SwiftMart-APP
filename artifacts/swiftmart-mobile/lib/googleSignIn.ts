/**
 * Native Google Sign-In wrapper (Android + iOS).
 * Metro resolves this file on native; googleSignIn.web.ts is used on web.
 *
 * Uses @react-native-google-signin/google-signin — provides the native
 * system account picker (no browser redirect), Play Store ready.
 */
import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';

// webClientId comes from google-services.json (client_type: 3 = web OAuth client).
// Required so Google returns an idToken that the backend can verify.
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '';

let configured = false;
function ensureConfigured() {
  if (configured) return;
  GoogleSignin.configure({ webClientId: WEB_CLIENT_ID, offlineAccess: false });
  configured = true;
}

/**
 * Trigger native Google Sign-In and return the idToken.
 * Throws a user-readable Error on cancel or failure.
 */
export async function signIn(): Promise<string> {
  ensureConfigured();
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const userInfo = await GoogleSignin.signIn();
    const idToken = userInfo.data?.idToken ?? null;
    if (!idToken) throw new Error('Google Sign-In did not return an ID token.');
    return idToken;
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err.code === statusCodes.SIGN_IN_CANCELLED) {
      throw new Error('CANCELLED');
    }
    if (err.code === statusCodes.IN_PROGRESS) {
      throw new Error('Sign-in already in progress.');
    }
    if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      throw new Error('Google Play Services not available on this device.');
    }
    throw new Error(err.message ?? 'Google Sign-In failed.');
  }
}

/** Sign out from Google (call alongside your app logout). */
export async function signOut(): Promise<void> {
  ensureConfigured();
  try {
    await GoogleSignin.signOut();
  } catch {}
}
