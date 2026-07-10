/**
 * Web stub for googleSignIn — Metro resolves this file on web.
 * The real Google Sign-In on web is handled in login.tsx via expo-auth-session.
 * These stubs keep the TypeScript types aligned across platforms.
 */

export async function signIn(): Promise<string> {
  // On web, login.tsx uses expo-auth-session directly; this should never be called.
  throw new Error('Use expo-auth-session for Google Sign-In on web.');
}

export async function signOut(): Promise<void> {
  // no-op on web
}
