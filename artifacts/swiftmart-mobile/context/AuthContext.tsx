import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from '@/lib/types';
import { BASE_URL, API_SERVER_BASE } from '@/lib/api';
import { registerForPushNotifications, unregisterPushToken } from '@/lib/pushNotifications';

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  phone: string;
  role: 'customer' | 'vendor' | 'rider';
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  /** Email + password login — routes through our api-server which verifies
   *  against the Neon DB and forwards the session to the production API. */
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  loginWithTruecaller: (accessToken: string, requestNonce: string, profile: { phone: string; name: string; email?: string }) => Promise<void>;
  register: (data: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (patch: Partial<User>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

async function persistSession(token: string, user: User) {
  await AsyncStorage.multiSet([['token', token], ['user', JSON.stringify(user)]]);
}

function extractSession(data: Record<string, unknown>): { token: string; user: User } {
  const nested = (data.data ?? {}) as Record<string, unknown>;
  const token = (data.token ?? data.accessToken ?? nested.token ?? nested.accessToken) as string;
  const user = (data.user ?? nested.user) as User;
  if (!token || !user) throw new Error('Unexpected response from server');
  return { token, user };
}

// Resolve the right proxy URL for the current platform.
// On web the app talks through our api-server proxy; on native it hits the
// production API directly (no CORS constraints).
function authUrl(path: string) {
  return `${BASE_URL}${path}`;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [[, t], [, u]] = await AsyncStorage.multiGet(['token', 'user']);
        if (t && u) {
          setToken(t);
          setUser(JSON.parse(u));
          registerForPushNotifications(t).catch(() => {});
        }
      } catch {}
      setIsLoading(false);
    })();
  }, []);

  async function applySession(data: Record<string, unknown>) {
    const { token: t, user: u } = extractSession(data);
    await persistSession(t, u);
    setToken(t);
    setUser(u);
    registerForPushNotifications(t).catch(() => {});
  }

  // ─── Email + password ────────────────────────────────────────────────────
  // Routes through our api-server (/api/auth/email-login) which:
  //  1. Verifies email + bcrypt hash against the Neon DB
  //  2. Forwards the phone + password to the production API
  //  3. Returns the production token so all existing API calls keep working
  async function login(email: string, password: string) {
    if (!API_SERVER_BASE) {
      throw new Error('API server URL is not configured (EXPO_PUBLIC_DOMAIN or EXPO_PUBLIC_API_SERVER_URL missing).');
    }
    const res = await fetch(`${API_SERVER_BASE}/auth/email-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (!res.ok) throw new Error((data.message as string) || 'Invalid email or password');
    await applySession(data);
  }

  // ─── Google Sign-In ──────────────────────────────────────────────────────
  // idToken comes from expo-auth-session (OIDC id_token).
  // The production API's /auth/google verifies it with Google.
  async function loginWithGoogle(idToken: string) {
    const res = await fetch(authUrl('/auth/google'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: idToken }),
    });
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (!res.ok) throw new Error((data.message as string) || 'Google sign-in failed');
    await applySession(data);
  }

  // ─── Truecaller ──────────────────────────────────────────────────────────
  // Called after the Truecaller SDK returns a verified profile.
  // Always routes through our api-server (API_SERVER_BASE) which verifies the
  // Truecaller access token and either logs in or creates the account.
  async function loginWithTruecaller(
    accessToken: string,
    requestNonce: string,
    profile: { phone: string; name: string; email?: string },
  ) {
    if (!API_SERVER_BASE) throw new Error('API server URL is not configured (EXPO_PUBLIC_DOMAIN or EXPO_PUBLIC_API_SERVER_URL missing).');
    const res = await fetch(`${API_SERVER_BASE}/auth/truecaller`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken, requestNonce, ...profile }),
    });
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (!res.ok) throw new Error((data.message as string) || 'Truecaller sign-in failed');
    await applySession(data);
  }

  // ─── Register ────────────────────────────────────────────────────────────
  // Routes through our api-server (when available) so the new account also
  // gets mirrored into the Neon DB — otherwise a subsequent email/password
  // login (which checks Neon) would 401 until the next production→Neon sync.
  // Falls back to hitting production directly if the api-server URL isn't
  // configured (e.g. native build with no EXPO_PUBLIC_API_SERVER_URL set).
  async function register(payload: RegisterPayload) {
    const url = API_SERVER_BASE ? `${API_SERVER_BASE}/auth/register` : authUrl('/auth/signup');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({})) as Record<string, unknown>;
    if (!res.ok) throw new Error((data.message as string) || 'Registration failed');
    await applySession(data);
  }

  // ─── Logout ──────────────────────────────────────────────────────────────
  async function logout() {
    if (token) {
      const pushToken = await AsyncStorage.getItem('pushToken');
      await unregisterPushToken(token, pushToken).catch(() => {});
    }
    await AsyncStorage.multiRemove(['token', 'user', 'pushToken']);
    setToken(null);
    setUser(null);
  }

  async function updateUser(patch: Partial<User>) {
    setUser(prev => {
      if (!prev) return prev;
      const updated = { ...prev, ...patch };
      AsyncStorage.setItem('user', JSON.stringify(updated)).catch(() => {});
      return updated;
    });
  }

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, loginWithGoogle, loginWithTruecaller, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
