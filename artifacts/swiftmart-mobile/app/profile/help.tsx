import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Linking, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { ScreenHeader } from '@/components/ScreenHeader';

const FAQS = [
  {
    q: 'How do I track my order?',
    a: 'Go to the Orders tab, tap on your order, then tap "Track Order". You can see real-time updates on your delivery rider\'s location.',
  },
  {
    q: 'Can I cancel my order?',
    a: 'Orders can be cancelled within 5 minutes of placing them, as long as the shop has not yet confirmed. Go to Orders → your order → Cancel Order.',
  },
  {
    q: 'What if I receive a wrong or damaged item?',
    a: 'Tap "Report Issue" on the delivered order within 24 hours. Our support team will resolve it within 48 hours with a refund or replacement.',
  },
  {
    q: 'How long does delivery take?',
    a: 'Typical delivery time is 20–45 minutes depending on the shop\'s distance, your location, and rider availability.',
  },
  {
    q: 'How do I change my delivery address?',
    a: 'You can change the delivery address before the shop confirms your order. Go to the cart, tap the address section, and select or add a new address.',
  },
  {
    q: 'Are there any extra charges?',
    a: 'A small delivery fee may apply based on your distance from the shop. This is shown clearly at checkout before you place the order.',
  },
  {
    q: 'How do I get a refund?',
    a: 'Refunds for cancelled or problematic orders are processed within 5–7 business days to your original payment method.',
  },
];

const CONTACTS = [
  { icon: 'call-outline',    label: 'Call Support',   sub: '1800-123-4567 (9am–9pm)', action: () => Linking.openURL('tel:18001234567') },
  { icon: 'mail-outline',    label: 'Email Us',        sub: 'support@swiftmart.in',    action: () => Linking.openURL('mailto:support@swiftmart.in') },
  { icon: 'logo-whatsapp',   label: 'WhatsApp',        sub: 'Chat with us instantly',  action: () => Linking.openURL('https://wa.me/918001234567') },
];

export default function HelpSupportScreen() {
  const colors = useColors();
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  function toggle(i: number) { setOpenIdx(prev => (prev === i ? null : i)); }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Help & Support" />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Contact options */}
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>CONTACT US</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {CONTACTS.map((c, i) => (
            <TouchableOpacity
              key={c.label}
              style={[styles.contactRow, i < CONTACTS.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
              onPress={c.action}
              activeOpacity={0.7}
            >
              <View style={[styles.contactIcon, { backgroundColor: colors.secondary }]}>
                <Ionicons name={c.icon as 'call-outline'} size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.contactLabel, { color: colors.foreground }]}>{c.label}</Text>
                <Text style={[styles.contactSub, { color: colors.mutedForeground }]}>{c.sub}</Text>
              </View>
              <Ionicons name="chevron-forward" size={17} color={colors.mutedForeground} />
            </TouchableOpacity>
          ))}
        </View>

        {/* FAQs */}
        <Text style={[styles.sectionTitle, { color: colors.mutedForeground }]}>FREQUENTLY ASKED QUESTIONS</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {FAQS.map((faq, i) => (
            <View key={i} style={i < FAQS.length - 1 ? { borderBottomWidth: 1, borderBottomColor: colors.border } : undefined}>
              <TouchableOpacity
                style={styles.faqHeader}
                onPress={() => toggle(i)}
                activeOpacity={0.7}
              >
                <Text style={[styles.faqQ, { color: colors.foreground, flex: 1 }]}>{faq.q}</Text>
                <Ionicons
                  name={openIdx === i ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={colors.mutedForeground}
                />
              </TouchableOpacity>
              {openIdx === i && (
                <Text style={[styles.faqA, { color: colors.mutedForeground }]}>{faq.a}</Text>
              )}
            </View>
          ))}
        </View>

        {/* Emergency */}
        <View style={[styles.emergencyBox, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}>
          <Ionicons name="warning-outline" size={18} color="#EA580C" />
          <View style={{ flex: 1 }}>
            <Text style={[styles.emergencyTitle, { color: '#9A3412' }]}>Order Emergency?</Text>
            <Text style={[styles.emergencyText, { color: '#C2410C' }]}>
              If your order is significantly late or there's a safety concern, call us immediately at 1800-123-4567.
            </Text>
          </View>
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
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  contactIcon: { width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  contactLabel: { fontSize: 14, fontWeight: '600' },
  contactSub: { fontSize: 12, marginTop: 1 },
  faqHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  faqQ: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  faqA: { fontSize: 13, lineHeight: 20, paddingHorizontal: 14, paddingBottom: 14 },
  emergencyBox: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: 14, borderWidth: 1, alignItems: 'flex-start' },
  emergencyTitle: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  emergencyText: { fontSize: 12, lineHeight: 18 },
});
