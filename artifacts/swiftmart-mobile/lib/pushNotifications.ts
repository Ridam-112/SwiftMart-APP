import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NOTIFICATIONS_BASE_URL } from './api';

// Show an in-app banner + play sound when a push arrives while the app is open.
// When backgrounded/closed the OS renders the notification via FCM / APNs.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'General',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#16A34A',
    sound: 'default',
  });
}

/**
 * Strategy:
 * 1. In standalone/production builds → getDevicePushTokenAsync() returns the
 *    raw FCM token (Android) or APNs token (iOS). The backend sends via Firebase Admin SDK.
 * 2. In Expo Go → getDevicePushTokenAsync() is Expo Go's own token, which only
 *    works via Expo's push service; fall back to getExpoPushTokenAsync() instead.
 *
 * Both token types are accepted by the /register-token endpoint.
 */
async function obtainBestToken(): Promise<string | null> {
  const isExpoGo = Constants.appOwnership === 'expo';

  // ── Standalone builds: try native FCM token first ──────────────────────────
  if (!isExpoGo && Platform.OS === 'android') {
    try {
      const { data: fcmToken } = await Notifications.getDevicePushTokenAsync();
      if (fcmToken && fcmToken.length >= 50) return fcmToken;
    } catch {
      // getDevicePushTokenAsync not available in this environment — fall through
    }
  }

  // ── Expo Go & iOS fallback: Expo push token ─────────────────────────────────
  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;
    const { data: expoToken } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    return expoToken;
  } catch {
    // A dev build without EAS project id configured — give up gracefully.
    return null;
  }
}

/**
 * Requests notification permission, obtains the best available push token
 * (FCM in standalone builds, Expo push token in Expo Go), and registers it
 * with the SwiftMart backend.
 */
export async function registerForPushNotifications(
  authToken: string,
): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  if (!Device.isDevice) return null;   // Simulator / emulator — no real push

  await ensureAndroidChannel();

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return null;

  const token = await obtainBestToken();
  if (!token) return null;

  try {
    const resp = await fetch(`${NOTIFICATIONS_BASE_URL}/register-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ token, platform: Platform.OS }),
    });

    if (resp.ok) {
      const { tokenType } = await resp.json();
      console.log(`[Push] Registered ${tokenType} token`);
    }

    await AsyncStorage.setItem('pushToken', token);
    return token;
  } catch {
    // Network failure — best-effort registration, don't crash the app
    return null;
  }
}

/** Removes the device push token from the backend (call on logout). */
export async function unregisterPushToken(
  authToken: string,
  pushToken: string | null,
) {
  if (!pushToken) return;
  try {
    await fetch(`${NOTIFICATIONS_BASE_URL}/unregister-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ token: pushToken }),
    });
  } catch {
    // best-effort cleanup
  }
}
