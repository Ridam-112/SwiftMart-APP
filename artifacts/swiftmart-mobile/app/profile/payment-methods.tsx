import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { showAlert } from '@/lib/alert';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { ScreenHeader } from '@/components/ScreenHeader';

type Method = { id: string; type: 'upi' | 'card' | 'wallet'; label: string; sub: string; icon: string; };

const DEFAULT_METHODS: Method[] = [
  { id: '1', type: 'upi',    label: 'Google Pay',    sub: 'user@okicici',            icon: 'phone-portrait-outline' },
  { id: '2', type: 'upi',    label: 'PhonePe',       sub: 'user@ybl',                icon: 'phone-portrait-outline' },
  { id: '3', type: 'card',   label: 'Visa •••• 4242', sub: 'Expires 08/27',          icon: 'card-outline' },
  { id: '4', type: 'wallet', label: 'Paytm Wallet',  sub: '₹250 available',          icon: 'wallet-outline' },
];

const OPTIONS = [
  { icon: 'phone-portrait-outline', label: 'Add UPI ID' },
  { icon: 'card-outline',           label: 'Add Credit / Debit Card' },
  { icon: 'wallet-outline',         label: 'Link Wallet' },
  { icon: 'business-outline',       label: 'Net Banking' },
];

export default function PaymentMethodsScreen() {
  const colors = useColors();
  const [methods] = useState<Method[]>(DEFAULT_METHODS);

  function handleRemove(label: string) {
    showAlert('Remove', `Remove "${label}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => showAlert('Demo', 'Payment management coming soon.') },
    ]);
  }

  function handleAdd(label: string) {
    showAlert('Coming Soon', `${label} will be available soon.`);
  }

  const iconColor = (type: Method['type']) =>
    type === 'card' ? '#6366F1' : type === 'upi' ? '#16A34A' : '#F97316';

  const iconBg = (type: Method['type']) =>
    type === 'card' ? '#EEF2FF' : type === 'upi' ? '#DCFCE7' : '#FFF7ED';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Payment Methods" />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Saved methods */}
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>SAVED METHODS</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {methods.map((m, i) => (
            <View
              key={m.id}
              style={[styles.row, i < methods.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
            >
              <View style={[styles.methodIcon, { backgroundColor: iconBg(m.type) }]}>
                <Ionicons name={m.icon as 'card-outline'} size={20} color={iconColor(m.type)} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: colors.foreground }]}>{m.label}</Text>
                <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{m.sub}</Text>
              </View>
              <TouchableOpacity onPress={() => handleRemove(m.label)} style={styles.removeBtn}>
                <Ionicons name="trash-outline" size={17} color={colors.destructive} />
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* Add new */}
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>ADD NEW</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {OPTIONS.map((o, i) => (
            <TouchableOpacity
              key={o.label}
              style={[styles.row, i < OPTIONS.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
              onPress={() => handleAdd(o.label)}
              activeOpacity={0.7}
            >
              <View style={[styles.methodIcon, { backgroundColor: colors.secondary }]}>
                <Ionicons name={o.icon as 'card-outline'} size={20} color={colors.primary} />
              </View>
              <Text style={[styles.rowLabel, { color: colors.foreground, flex: 1 }]}>{o.label}</Text>
              <Ionicons name="chevron-forward" size={17} color={colors.mutedForeground} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Info */}
        <View style={[styles.infoBox, { backgroundColor: colors.secondary }]}>
          <Ionicons name="lock-closed-outline" size={16} color={colors.primary} />
          <Text style={[styles.infoText, { color: colors.secondaryForeground }]}>
            Your payment information is encrypted and stored securely. SwiftMart never stores your full card number.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { padding: 16, gap: 10, paddingBottom: 40 },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, paddingHorizontal: 4, marginTop: 8 },
  card: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  methodIcon: { width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 14, fontWeight: '600' },
  rowSub: { fontSize: 12, marginTop: 1 },
  removeBtn: { padding: 6 },
  infoBox: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 14, alignItems: 'flex-start' },
  infoText: { flex: 1, fontSize: 13, lineHeight: 18 },
});
