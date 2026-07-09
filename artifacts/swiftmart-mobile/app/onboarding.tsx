import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

export default function OnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { updateUser } = useAuth();
  const [pincode, setPincode] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleContinue() {
    if (pincode.trim().length !== 6 || !/^\d{6}$/.test(pincode.trim())) {
      Alert.alert('Invalid pincode', 'Please enter a valid 6-digit pincode.');
      return;
    }
    try {
      setLoading(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      try {
        await api.patch('/users/me/profile', { pincode: pincode.trim() });
      } catch {
        // Non-fatal: still update locally so onboarding doesn't block the user.
      }
      await updateUser({ pincode: pincode.trim() });
      router.replace('/(customer)/home');
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleSkip() {
    router.replace('/(customer)/home');
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <LinearGradient colors={['#16A34A', '#22C55E']} style={[styles.header, { paddingTop: insets.top + 40 }]}>
        <View style={styles.iconCircle}>
          <Ionicons name="location" size={36} color="#16A34A" />
        </View>
        <Text style={styles.title}>Where should we deliver?</Text>
        <Text style={styles.subtitle}>Enter your pincode to see shops near you</Text>
      </LinearGradient>

      <View style={styles.body}>
        <View style={[styles.inputWrap, { backgroundColor: colors.input, borderColor: colors.border }]}>
          <Ionicons name="pin-outline" size={18} color={colors.mutedForeground} />
          <TextInput
            style={[styles.input, { color: colors.foreground }]}
            placeholder="6-digit pincode"
            placeholderTextColor={colors.mutedForeground}
            value={pincode}
            onChangeText={t => setPincode(t.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            maxLength={6}
          />
        </View>

        <TouchableOpacity
          style={[styles.btn, { backgroundColor: colors.primary }]}
          onPress={handleContinue}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Continue</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}>
          <Text style={[styles.skipText, { color: colors.mutedForeground }]}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 24, paddingBottom: 40, alignItems: 'center' },
  iconCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { color: '#fff', fontSize: 22, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 14, marginTop: 6, textAlign: 'center' },
  body: { flex: 1, padding: 24, marginTop: -20, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, marginTop: 24,
  },
  input: { flex: 1, fontSize: 16, letterSpacing: 2 },
  btn: { height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  skipBtn: { alignItems: 'center', marginTop: 16 },
  skipText: { fontSize: 14, fontWeight: '600' },
});
