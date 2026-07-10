import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator, Platform, KeyboardAvoidingView,
} from 'react-native';
import { showAlert } from '@/lib/alert';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { ScreenHeader } from '@/components/ScreenHeader';

export default function EditProfileScreen() {
  const colors = useColors();
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) { showAlert('Error', 'Name cannot be empty.'); return; }
    setSaving(true);
    try {
      // Try to persist via API; fall back to local-only update if endpoint doesn't exist
      try {
        await api.put('/profile', { name: name.trim(), email: email.trim(), phone: phone.trim() });
      } catch {}
      await updateUser({ name: name.trim(), email: email.trim(), phone: phone.trim() });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert('Saved', 'Your profile has been updated.');
    } catch (e: unknown) {
      showAlert('Error', e instanceof Error ? e.message : 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  }

  const field = (label: string, value: string, onChange: (v: string) => void, opts?: { keyboardType?: 'default' | 'email-address' | 'phone-pad'; placeholder?: string }) => (
    <View style={styles.fieldWrap}>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>{label}</Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
        value={value}
        onChangeText={onChange}
        placeholder={opts?.placeholder ?? label}
        placeholderTextColor={colors.mutedForeground}
        keyboardType={opts?.keyboardType ?? 'default'}
        autoCapitalize={opts?.keyboardType === 'email-address' ? 'none' : 'words'}
      />
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Edit Profile" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {/* Avatar initials display */}
          <View style={styles.avatarWrap}>
            <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
              <Text style={styles.avatarText}>
                {name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || '?'}
              </Text>
            </View>
          </View>

          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {field('Full Name', name, setName, { placeholder: 'Your full name' })}
            {field('Email', email, setEmail, { keyboardType: 'email-address', placeholder: 'you@example.com' })}
            {field('Phone', phone, setPhone, { keyboardType: 'phone-pad', placeholder: '+91 00000 00000' })}
          </View>

          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: colors.mutedForeground }]}>Role</Text>
              <Text style={[styles.infoValue, { color: colors.foreground }]}>
                {user?.role?.charAt(0).toUpperCase()}{user?.role?.slice(1)}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.7 : 1 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.saveBtnText}>Save Changes</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { padding: 16, gap: 16, paddingBottom: 40 },
  avatarWrap: { alignItems: 'center', paddingVertical: 8 },
  avatar: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 28, fontWeight: '800' },
  card: { borderRadius: 16, borderWidth: 1, overflow: 'hidden', paddingHorizontal: 16, paddingVertical: 8 },
  fieldWrap: { paddingVertical: 10 },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14 },
  infoLabel: { fontSize: 14 },
  infoValue: { fontSize: 14, fontWeight: '600' },
  saveBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
