import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  Switch, Alert, ActivityIndicator, Platform, KeyboardAvoidingView,
} from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { api } from '@/lib/api';
import { Shop } from '@/lib/types';

interface FormState {
  name: string;
  description: string;
  category: string;
  image: string;
  city: string;
  pincode: string;
  deliveryTime: string;
  deliveryFee: string;
  minOrder: string;
  isOpen: boolean;
}

const EMPTY_FORM: FormState = {
  name: '', description: '', category: '', image: '',
  city: '', pincode: '', deliveryTime: '', deliveryFee: '', minOrder: '', isOpen: true,
};

export default function VendorShopSettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const topPad = Platform.OS === 'web' ? 20 : insets.top;
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const { data: shop, isLoading } = useQuery<Shop | null>({
    queryKey: ['my-shop'],
    queryFn: async () => {
      try {
        const res = await api.get<Record<string, unknown>>('/shops/my/profile');
        return (res.shop ?? res) as Shop;
      } catch {
        return null;
      }
    },
  });

  useEffect(() => {
    if (shop) {
      setForm({
        name: shop.name ?? '',
        description: shop.description ?? '',
        category: shop.category ?? '',
        image: shop.image ?? shop.coverImage ?? '',
        city: shop.address?.city ?? '',
        pincode: shop.address?.pincode ?? '',
        deliveryTime: shop.deliveryTime ?? '',
        deliveryFee: shop.deliveryFee != null ? String(shop.deliveryFee) : '',
        minOrder: shop.minOrder != null ? String(shop.minOrder) : '',
        isOpen: shop.isOpen !== false,
      });
    }
  }, [shop]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!form.name.trim()) {
      Alert.alert('Missing field', 'Shop name is required.');
      return;
    }
    try {
      setSaving(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await api.patch('/shops/my/profile', {
        name: form.name.trim(),
        description: form.description.trim(),
        category: form.category.trim(),
        image: form.image.trim() || undefined,
        address: { city: form.city.trim(), pincode: form.pincode.trim() },
        deliveryTime: form.deliveryTime.trim(),
        deliveryFee: form.deliveryFee ? Number(form.deliveryFee) : undefined,
        minOrder: form.minOrder ? Number(form.minOrder) : undefined,
        isOpen: form.isOpen,
      });
      qc.invalidateQueries({ queryKey: ['my-shop'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Saved', 'Your shop settings have been updated.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save shop settings.');
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return (
      <View style={[styles.loader, { paddingTop: topPad, backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Shop Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 + insets.bottom }} keyboardShouldPersistTaps="handled">
        {[
          { key: 'name' as const, label: 'Shop Name', placeholder: 'e.g. Fresh Mart' },
          { key: 'category' as const, label: 'Category', placeholder: 'e.g. Grocery' },
          { key: 'image' as const, label: 'Shop Image URL', placeholder: 'https://…' },
          { key: 'city' as const, label: 'City', placeholder: 'e.g. Mumbai' },
          { key: 'pincode' as const, label: 'Pincode', placeholder: '6-digit pincode', keyboardType: 'number-pad' as const },
          { key: 'deliveryTime' as const, label: 'Delivery Time', placeholder: 'e.g. 20-30 mins' },
          { key: 'deliveryFee' as const, label: 'Delivery Fee (₹)', placeholder: '0', keyboardType: 'numeric' as const },
          { key: 'minOrder' as const, label: 'Minimum Order (₹)', placeholder: '0', keyboardType: 'numeric' as const },
        ].map(f => (
          <View key={f.key} style={styles.field}>
            <Text style={[styles.label, { color: colors.foreground }]}>{f.label}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
              placeholder={f.placeholder}
              placeholderTextColor={colors.mutedForeground}
              value={form[f.key]}
              onChangeText={t => set(f.key, t)}
              keyboardType={f.keyboardType ?? 'default'}
            />
          </View>
        ))}

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.foreground }]}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
            placeholder="Tell customers about your shop"
            placeholderTextColor={colors.mutedForeground}
            value={form.description}
            onChangeText={t => set('description', t)}
            multiline
            numberOfLines={4}
          />
        </View>

        <View style={[styles.switchRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View>
            <Text style={[styles.label, { color: colors.foreground, marginBottom: 2 }]}>Shop is Open</Text>
            <Text style={[styles.switchSub, { color: colors.mutedForeground }]}>Turn off to pause new orders</Text>
          </View>
          <Switch
            value={form.isOpen}
            onValueChange={v => set('isOpen', v)}
            trackColor={{ false: colors.muted, true: colors.primary }}
          />
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: colors.primary }]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  textArea: { height: 90, textAlignVertical: 'top' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 20 },
  switchSub: { fontSize: 12 },
  saveBtn: { height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
