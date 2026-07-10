import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
  ActivityIndicator, Image,
} from 'react-native';
import { useRouter, Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';

// ─── Google Sign-In ───────────────────────────────────────────────────────────
// On native (Android/iOS) we use @react-native-google-signin/google-signin
// which shows the native account picker — no browser redirect, Play Store ready.
// On web we fall back to expo-auth-session (OIDC redirect flow).
import * as AuthSession from 'expo-auth-session';
import * as TruecallerSDK from '@/modules/expo-truecaller/src/index';

// Only import native Google SDK on native platforms; avoid crashing on web.
// Metro resolves platform-specific files automatically (.web.ts stub exists).
import * as GoogleSDK from '@/lib/googleSignIn';

WebBrowser.maybeCompleteAuthSession();

// Web-only Google OAuth via expo-auth-session
const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '';
const TRUECALLER_APP_KEY = process.env.EXPO_PUBLIC_TRUECALLER_APP_KEY ?? '';

const GOOGLE_DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { login, loginWithGoogle, loginWithTruecaller } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);

  const [loading, setLoading]               = useState(false);
  const [googleLoading, setGoogleLoading]   = useState(false);
  const [tcLoading, setTcLoading]           = useState(false);

  // Web Google fallback via expo-auth-session
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'swiftmart-mobile' });
  const [webRequest, , webPromptAsync] = AuthSession.useAuthRequest(
    {
      clientId:     GOOGLE_CLIENT_ID || 'not-configured',
      scopes:       ['openid', 'profile', 'email'],
      redirectUri,
      responseType: AuthSession.ResponseType.IdToken,
      usePKCE:      false,
    },
    GOOGLE_DISCOVERY,
  );

  // ── Email + password ──────────────────────────────────────────────────────
  async function handleLogin() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !password) {
      Alert.alert('Missing fields', 'Please enter your email and password.');
      return;
    }
    try {
      setLoading(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await login(trimmed, password);
      router.replace('/');
    } catch (e: unknown) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const msg = e instanceof Error ? e.message : 'Please try again.';
      Alert.alert('Sign in failed', msg);
    } finally {
      setLoading(false);
    }
  }

  // ── Google Sign-In ────────────────────────────────────────────────────────
  async function handleGoogle() {
    try {
      setGoogleLoading(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      let idToken: string | null = null;

      if (Platform.OS !== 'web') {
        // Native: use the real Google SDK (no browser redirect)
        idToken = await GoogleSDK.signIn();
      } else {
        // Web: OIDC redirect flow
        if (!GOOGLE_CLIENT_ID) {
          Alert.alert('Google Sign-In unavailable', 'EXPO_PUBLIC_GOOGLE_CLIENT_ID not set.');
          return;
        }
        const result = await webPromptAsync();
        if (result.type === 'cancel' || result.type === 'dismiss') return;
        if (result.type !== 'success') throw new Error('Google sign-in was not completed.');
        idToken = result.params.id_token ?? null;
      }

      if (!idToken) throw new Error('No ID token returned by Google.');
      await loginWithGoogle(idToken);
      router.replace('/');
    } catch (e: unknown) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Google Sign-In failed', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  }

  // ── Truecaller ────────────────────────────────────────────────────────────
  async function handleTruecaller() {
    if (Platform.OS !== 'android') {
      Alert.alert('Not available', 'Sign in with Truecaller is only available on Android.');
      return;
    }
    if (!TRUECALLER_APP_KEY) {
      Alert.alert('Truecaller not configured', 'EXPO_PUBLIC_TRUECALLER_APP_KEY not set.');
      return;
    }
    const usable = await TruecallerSDK.isTruecallerUsable();
    if (!usable) {
      Alert.alert('Truecaller not installed', 'Please install the Truecaller app and try again.');
      return;
    }
    try {
      setTcLoading(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const profile = await TruecallerSDK.requestTruecallerProfile();
      const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'User';
      await loginWithTruecaller(profile.accessToken, profile.requestNonce ?? '', {
        phone: profile.phoneNumber,
        name,
        email: profile.email,
      });
      router.replace('/');
    } catch (e: unknown) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert(
        'Truecaller Sign-In failed',
        e instanceof Error ? e.message : 'Please try again or use email + password.',
      );
    } finally {
      setTcLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#000' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo */}
        <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
          <Image
            source={require('../assets/images/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.brandName}>SwiftMart</Text>
          <Text style={styles.tagline}>Fast delivery, right at your door</Text>
        </View>

        {/* Form */}
        <View style={[styles.form, { backgroundColor: colors.background }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>Welcome back</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Sign in to your account
          </Text>

          {/* Email */}
          <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Ionicons name="mail-outline" size={20} color={colors.mutedForeground} />
            <TextInput
              style={[styles.input, { color: colors.foreground }]}
              placeholder="Email address"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={setEmail}
              returnKeyType="next"
            />
          </View>

          {/* Password */}
          <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Ionicons name="lock-closed-outline" size={20} color={colors.mutedForeground} />
            <TextInput
              style={[styles.input, { color: colors.foreground }]}
              placeholder="Password"
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry={!showPw}
              value={password}
              onChangeText={setPassword}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />
            <TouchableOpacity onPress={() => setShowPw(v => !v)} hitSlop={8}>
              <Ionicons
                name={showPw ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={colors.mutedForeground}
              />
            </TouchableOpacity>
          </View>

          {/* Sign in */}
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.primaryBtnText}>Sign In</Text>}
          </TouchableOpacity>

          {/* Register */}
          <View style={styles.row}>
            <Text style={[styles.rowText, { color: colors.mutedForeground }]}>
              Don't have an account?{' '}
            </Text>
            <Link href="/register" asChild>
              <TouchableOpacity>
                <Text style={[styles.rowLink, { color: colors.primary }]}>Register</Text>
              </TouchableOpacity>
            </Link>
          </View>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>
              or continue with
            </Text>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          </View>

          {/* Google */}
          <TouchableOpacity
            style={[styles.socialBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={handleGoogle}
            disabled={googleLoading || (Platform.OS === 'web' && !webRequest)}
            activeOpacity={0.8}
          >
            {googleLoading ? (
              <ActivityIndicator color={colors.foreground} />
            ) : (
              <>
                <Text style={styles.googleG}>G</Text>
                <Text style={[styles.socialBtnText, { color: colors.foreground }]}>
                  Continue with Google
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* Truecaller — shown on all platforms, works only on Android */}
          <TouchableOpacity
            style={[styles.socialBtn, { borderColor: '#005AFF22', backgroundColor: '#005AFF0D' }]}
            onPress={handleTruecaller}
            disabled={tcLoading}
            activeOpacity={0.8}
          >
            {tcLoading ? (
              <ActivityIndicator color="#005AFF" />
            ) : (
              <>
                <View style={styles.tcBadge}>
                  <Text style={styles.tcT}>T</Text>
                </View>
                <Text style={[styles.socialBtnText, { color: colors.foreground }]}>
                  Continue with Truecaller
                  {Platform.OS !== 'android' ? ' (Android only)' : ''}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: '#000',
    paddingHorizontal: 24,
    paddingBottom: 32,
    alignItems: 'center',
  },
  logo:      { width: 100, height: 100 },
  brandName: { color: '#fff', fontSize: 28, fontWeight: '800', marginTop: 8 },
  tagline:   { color: '#ffffff80', fontSize: 13, marginTop: 4 },

  form: {
    flex: 1,
    padding: 24,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -20,
  },
  title:    { fontSize: 24, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: 14, marginBottom: 24 },

  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 14, marginBottom: 12,
  },
  input: { flex: 1, fontSize: 15 },

  primaryBtn: {
    height: 52, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16, marginTop: 4,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  row:      { flexDirection: 'row', justifyContent: 'center', marginBottom: 24 },
  rowText:  { fontSize: 14 },
  rowLink:  { fontSize: 14, fontWeight: '700' },

  dividerRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 12, fontWeight: '500' },

  socialBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    height: 50, borderRadius: 12, borderWidth: 1, marginBottom: 12,
  },
  socialBtnText: { fontSize: 15, fontWeight: '600' },

  googleG: {
    fontSize: 18, fontWeight: '800', color: '#4285F4',
    width: 24, textAlign: 'center',
  },
  tcBadge: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#005AFF', alignItems: 'center', justifyContent: 'center',
  },
  tcT: { color: '#fff', fontSize: 13, fontWeight: '800' },
});
