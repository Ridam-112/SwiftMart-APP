import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// The SwiftMart production backend's CORS policy only whitelists a handful
// of origins (its own domain, localhost, capacitor://localhost) and returns
// a 500 error for any other browser Origin — including this workspace's
// preview domain. On web we route through our own api-server, which proxies
// the request server-to-server (no Origin header involved) to sidestep that
// restriction. Native (iOS/Android) requests don't send an Origin header, so
// they can keep talking to the backend directly.
const DOMAIN = process.env.EXPO_PUBLIC_DOMAIN;
export const BASE_URL =
  Platform.OS === 'web' && DOMAIN
    ? `https://${DOMAIN}/api/proxy`
    : 'https://swiftmart.space/api';

// Routes that read directly from our own Neon database (hero banners,
// homepage sections, etc.) and the image upload endpoint always live on
// our own api-server, regardless of platform, so the app stays in sync
// with whatever the website's admin changes in the database.
// These must always hit our own api-server (never swiftmart.space directly —
// it has no /db or /upload routes), on every platform.
// Our own api-server — prefer an explicit override, fall back to Replit domain.
// On native (APK/IPA) production builds set EXPO_PUBLIC_API_SERVER_URL to the
// deployed api-server URL (e.g. https://swiftmart-api.replit.app/api).
// Without it, hero-banners / homepage-sections / upload will not work in native.
export const API_SERVER_BASE: string =
  process.env.EXPO_PUBLIC_API_SERVER_URL ??
  (DOMAIN ? `https://${DOMAIN}/api` : 'https://swiftmart.space/api');

// All Neon-DB routes (hero banners, homepage sections, uploads, notifications)
// always go through our own api-server — never swiftmart.space directly.
export const DB_BASE_URL = API_SERVER_BASE;
export const UPLOAD_URL = `${API_SERVER_BASE}/upload`;
export const NOTIFICATIONS_BASE_URL = `${API_SERVER_BASE}/notifications`;

async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem('token');
}

async function request<T>(
  method: string,
  path: string,
  body?: object,
  requiresAuth = true,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (requiresAuth) {
    const token = await getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const err = await response.json();
      message = err.message || err.error || message;
    } catch {}
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string, auth = true) => request<T>('GET', path, undefined, auth),
  post: <T>(path: string, body: object, auth = true) => request<T>('POST', path, body, auth),
  put: <T>(path: string, body: object) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: object) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

/** Normalize a raw shop object from the API to match the Shop interface. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeShop<T = unknown>(raw: any): T {
  return {
    ...raw,
    _id: raw._id ?? raw.id,
    name: raw.name ?? raw.shopName,
    coverImage: raw.coverImage ?? raw.banner,
  } as T;
}

/** Extract an array from various API response shapes. */
export function extractList<T>(data: unknown, key?: string): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (key && Array.isArray(obj[key])) return obj[key] as T[];
    for (const k of ['data', 'shops', 'products', 'orders', 'items', 'results']) {
      if (Array.isArray(obj[k])) return obj[k] as T[];
    }
  }
  return [];
}
