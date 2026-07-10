import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useAuth, RegisterPayload } from '@/context/AuthContext';
import { useColors } from '@/hooks/useColors';

type Role = 'customer' | 'vendor' | 'rider';

export default function RegisterScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { register } = useAuth();

  const [name, setName]         = useState('');
  const [email, setEmail]       = useState('');
  const [phone, setPhone]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const role: Role = 'customer';
  const [loading, setLoading]   = useState(false);

  async function handleRegister() {
    if (!name.trim() || !email.trim() || !phone.trim() || !password) {
      Alert.alert('Missing fields', 'Please fill in all fields.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Weak password', 'Password must be at least 6 characters.');
      return;
    }
    try {
      setLoading(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const payload: RegisterPayload = { name: name.trim(), email: email.trim().toLowerCase(), phone: phone.trim(), password, role };
      await register(payload);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace(role === 'customer' ? '/onboarding' : '/');
    } catch (e: unknown) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Registration failed', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <LinearGradient colors={['#16A34A', '#22C55E']} style={[styles.header, { paddingTop: insets.top + 24 }]}>
          <Text style={styles.brand}>Create Account</Text>
          <Text style={styles.tagline}>Join SwiftMart today</Text>
        </LinearGradient>

        <View style={[styles.form, { backgroundColor: colors.background }]}>
          {/* Fields */}
          {[
            { label: 'Full Name', value: name, onChange: setName, icon: 'person-outline', keyboardType: 'default', autoCapitalize: 'words', placeholder: 'Your name' },
            { label: 'Email',     value: email, onChange: setEmail, icon: 'mail-outline', keyboardType: 'email-address', autoCapitalize: 'none', placeholder: 'Email address' },
            { label: 'Phone',     value: phone, onChange: setPhone, icon: 'call-outline', keyboardType: 'phone-pad', autoCapitalize: 'none', placeholder: 'Mobile number' },
          ].map(f => (
            <View key={f.label} style={[styles.inputWrap, { backgroundColor: colors.input, borderColor: colors.border }]}>
              <Ionicons name={f.icon as 'mail-outline'} size={18} color={colors.mutedForeground} />
              <TextInput
                style={[styles.input, { color: colors.foreground }]}
                placeholder={f.placeholder}
                placeholderTextColor={colors.mutedForeground}
                value={f.value}
                onChangeText={f.onChange}
                keyboardType={f.keyboardType as 'default'}
                autoCapitalize={f.autoCapitalize as 'words'}
              />
            </View>
          ))}

          {/* Password */}
          <View style={[styles.inputWrap, { backgroundColor: colors.input, borderColor: colors.border }]}>
            <Ionicons name="lock-closed-outline" size={18} color={colors.mutedForeground} />
            <TextInput
              style={[styles.input, { color: colors.foreground }]}
              placeholder="Password (min. 6 chars)"
              placeholderTextColor={colors.mutedForeground}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPw}
            />
            <TouchableOpacity onPress={() => setShowPw(p => !p)}>
              <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.primary }]}
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Create Account</Text>}
          </TouchableOpacity>

          <View style={styles.loginRow}>
            <Text style={[styles.loginText, { color: colors.mutedForeground }]}>Already have an account? </Text>
            <Link href="/login" asChild>
              <TouchableOpacity><Text style={[styles.loginLink, { color: colors.primary }]}>Sign In</Text></TouchableOpacity>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 24, paddingBottom: 36, alignItems: 'center' },
  brand: { color: '#fff', fontSize: 26, fontWeight: '800' },
  tagline: { color: 'rgba(255,255,255,0.85)', fontSize: 14, marginTop: 4 },
  form: { flex: 1, padding: 24, borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: -20 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, marginBottom: 12,
  },
  input: { flex: 1, fontSize: 15 },
  btn: { height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 20, marginTop: 4 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  loginRow: { flexDirection: 'row', justifyContent: 'center' },
  loginText: { fontSize: 14 },
  loginLink: { fontSize: 14, fontWeight: '700' },
});
