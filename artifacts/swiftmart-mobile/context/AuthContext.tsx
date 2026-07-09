import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from '@/lib/types';
import { BASE_URL } from '@/lib/api';
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
  login: (phone: string, password: string) => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<void>;
  register: (data: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (patch: Partial<User>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const pairs = await AsyncStorage.multiGet(['token', 'user']);
        const t = pairs[0][1];
        const u = pairs[1][1];
        if (t && u) {
          setToken(t);
          setUser(JSON.parse(u));
          registerForPushNotifications(t).catch(() => {});
        }
      } catch {}
      setIsLoading(false);
    })();
  }, []);

  async function login(phone: string, password: string) {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as Record<string, string>;
      throw new Error(err.message || 'Invalid email or password');
    }
    const data = await res.json() as Record<string, unknown>;
    const t = (data.token || data.accessToken || (data.data as Record<string,unknown>)?.token) as string;
    const u = (data.user || (data.data as Record<string,unknown>)?.user) as User;
    if (!t || !u) throw new Error('Unexpected response from server');
    await AsyncStorage.multiSet([['token', t], ['user', JSON.stringify(u)]]);
    setToken(t);
    setUser(u);
    registerForPushNotifications(t).catch(() => {});
  }

  async function loginWithGoogle(credential: string) {
    const res = await fetch(`${BASE_URL}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as Record<string, string>;
      throw new Error(err.message || 'Google sign-in failed');
    }
    const data = await res.json() as Record<string, unknown>;
    const t = (data.token || data.accessToken || (data.data as Record<string,unknown>)?.token) as string;
    const u = (data.user || (data.data as Record<string,unknown>)?.user) as User;
    if (!t || !u) throw new Error('Unexpected response from server');
    await AsyncStorage.multiSet([['token', t], ['user', JSON.stringify(u)]]);
    setToken(t);
    setUser(u);
    registerForPushNotifications(t).catch(() => {});
  }

  async function register(payload: RegisterPayload) {
    const res = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as Record<string, string>;
      throw new Error(err.message || 'Registration failed');
    }
    const data = await res.json() as Record<string, unknown>;
    const t = (data.token || data.accessToken || (data.data as Record<string,unknown>)?.token) as string;
    const u = (data.user || (data.data as Record<string,unknown>)?.user) as User;
    if (!t || !u) throw new Error('Unexpected response from server');
    await AsyncStorage.multiSet([['token', t], ['user', JSON.stringify(u)]]);
    setToken(t);
    setUser(u);
    registerForPushNotifications(t).catch(() => {});
  }

  async function logout() {
    if (token) {
      const pushToken = await AsyncStorage.getItem('pushToken');
      await unregisterPushToken(token, pushToken);
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
    <AuthContext.Provider value={{ user, token, isLoading, login, loginWithGoogle, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
