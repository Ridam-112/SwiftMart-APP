import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
  ActivityIndicator, Image,
} from 'react-native';
import { useRouter, Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { useAuth } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';

WebBrowser.maybeCompleteAuthSession();

// ─── Google OAuth ────────────────────────────────────────────────────────────
const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '';
const GOOGLE_DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint:         'https://oauth2.googleapis.com/token',
  revocationEndpoint:    'https://oauth2.googleapis.com/revoke',
};

// ─── Truecaller ──────────────────────────────────────────────────────────────
const TRUECALLER_APP_KEY = process.env.EXPO_PUBLIC_TRUECALLER_APP_KEY ?? '';

// Dynamically import Truecaller module — only exists on Android native builds.
// On web the stub returns false / throws an error.
type TruecallerModule = typeof import('@/modules/expo-truecaller/src/index');
let TruecallerSDK: TruecallerModule | null = null;
try {
  // This works on native; on web the /src/index.web.ts stub is used instead.
  TruecallerSDK = require('@/modules/expo-truecaller/src/index') as TruecallerModule;
} catch {
  TruecallerSDK = null;
}

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { login, loginWithGoogle, loginWithTruecaller } = useAuth();

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [truecallerLoading, setTruecallerLoading] = useState(false);
  const [truecallerAvailable, setTruecallerAvailable] = useState(false);

  // ── Google auth-session setup ─────────────────────────────────────────────
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'swiftmart-mobile' });

  const [request, , promptAsync] = AuthSession.useAuthRequest(
    {
      clientId:     GOOGLE_CLIENT_ID || 'not-configured',
      scopes:       ['openid', 'profile', 'email'],
      redirectUri,
      responseType: AuthSession.ResponseType.IdToken,
      usePKCE:      false,
    },
    GOOGLE_DISCOVERY,
  );

  // ── Check Truecaller availability on mount ─────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'android' || !TRUECALLER_APP_KEY || !TruecallerSDK) return;
    (async () => {
      try {
        await TruecallerSDK!.initializeTruecaller(TRUECALLER_APP_KEY);
        const usable = await TruecallerSDK!.isTruecallerUsable();
        setTruecallerAvailable(usable);
      } catch {}
    })();
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────
  async function handleLogin() {
    const trimmedPhone = phone.trim();
    if (!trimmedPhone || !password) {
      Alert.alert('Missing fields', 'Please enter your mobile number and password.');
      return;
    }
    try {
      setLoading(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await login(trimmedPhone, password);
      router.replace('/');
    } catch (e: unknown) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Login failed', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    if (!GOOGLE_CLIENT_ID) {
      Alert.alert(
        'Google Sign-In unavailable',
        'EXPO_PUBLIC_GOOGLE_CLIENT_ID is not configured.',
      );
      return;
    }
    try {
      setGoogleLoading(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const result = await promptAsync();
      if (result.type === 'cancel' || result.type === 'dismiss') return;
      if (result.type !== 'success') {
        throw new Error('Google sign-in was not completed.');
      }
      const idToken = result.params.id_token;
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

  async function handleTruecallerLogin() {
    // On web or iOS — explain the limitation
    if (Platform.OS !== 'android') {
      Alert.alert(
        'Not available',
        'Sign in with Truecaller is only available on Android devices.',
      );
      return;
    }
    if (!TRUECALLER_APP_KEY) {
      Alert.alert(
        'Truecaller not configured',
        'Set EXPO_PUBLIC_TRUECALLER_APP_KEY to enable Truecaller login.',
      );
      return;
    }
    if (!TruecallerSDK) {
      Alert.alert('Truecaller unavailable', 'This feature requires a native build.');
      return;
    }
    if (!truecallerAvailable) {
      Alert.alert(
        'Truecaller not installed',
        'Please install the Truecaller app and try again.',
      );
      return;
    }
    try {
      setTruecallerLoading(true);
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
        e instanceof Error ? e.message : 'Please try again or use phone + password.',
      );
    } finally {
      setTruecallerLoading(false);
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
        {/* ── Logo ── */}
        <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
          <Image
            source={require('../assets/images/logo.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
          <Text style={styles.brandName}>SwiftMart</Text>
          <Text style={styles.tagline}>Fast delivery, right at your door</Text>
        </View>

        {/* ── Form ── */}
        <View style={[styles.form, { backgroundColor: colors.background }]}>
          <Text style={[styles.title, { color: colors.foreground }]}>Welcome back</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Sign in to your account
          </Text>

          {/* Phone */}
          <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Ionicons name="call-outline" size={20} color={colors.mutedForeground} />
            <TextInput
              style={[styles.input, { color: colors.foreground }]}
              placeholder="Mobile number"
              placeholderTextColor={colors.mutedForeground}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
              maxLength={10}
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

          {/* Sign in button */}
          <TouchableOpacity
            style={[styles.loginBtn, { backgroundColor: colors.primary }]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.loginBtnText}>Sign In</Text>}
          </TouchableOpacity>

          {/* Register link */}
          <View style={styles.registerRow}>
            <Text style={[styles.registerText, { color: colors.mutedForeground }]}>
              Don't have an account?{' '}
            </Text>
            <Link href="/register" asChild>
              <TouchableOpacity>
                <Text style={[styles.registerLink, { color: colors.primary }]}>Register</Text>
              </TouchableOpacity>
            </Link>
          </View>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>or continue with</Text>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          </View>

          {/* ── Google Sign-In ── */}
          <TouchableOpacity
            style={[styles.socialBtn, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={handleGoogleLogin}
            disabled={googleLoading || !request}
          >
            {googleLoading ? (
              <ActivityIndicator color={colors.foreground} />
            ) : (
              <>
                {/* Google "G" logo using coloured text since no asset is bundled */}
                <Text style={styles.googleG}>G</Text>
                <Text style={[styles.socialBtnText, { color: colors.foreground }]}>
                  Continue with Google
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* ── Truecaller Sign-In ── */}
          <TouchableOpacity
            style={[styles.socialBtn, { borderColor: '#005AFF22', backgroundColor: '#005AFF11' }]}
            onPress={handleTruecallerLogin}
            disabled={truecallerLoading}
          >
            {truecallerLoading ? (
              <ActivityIndicator color="#005AFF" />
            ) : (
              <>
                <View style={styles.truecallerIcon}>
                  <Text style={styles.truecallerT}>T</Text>
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
  logoImage: { width: 100, height: 100 },
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
  loginBtn: {
    height: 52, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16, marginTop: 4,
  },
  loginBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  registerRow:  { flexDirection: 'row', justifyContent: 'center', marginBottom: 24 },
  registerText: { fontSize: 14 },
  registerLink: { fontSize: 14, fontWeight: '700' },
  dividerRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  dividerLine:  { flex: 1, height: 1 },
  dividerText:  { fontSize: 12, fontWeight: '500' },
  socialBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    height: 50, borderRadius: 12, borderWidth: 1, marginBottom: 12,
  },
  socialBtnText: { fontSize: 15, fontWeight: '600' },
  // Google "G" coloured badge
  googleG: {
    fontSize: 18,
    fontWeight: '800',
    color: '#4285F4',
    width: 24,
    textAlign: 'center',
  },
  // Truecaller badge
  truecallerIcon: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#005AFF', alignItems: 'center', justifyContent: 'center',
  },
  truecallerT: { color: '#fff', fontSize: 13, fontWeight: '800' },
});
