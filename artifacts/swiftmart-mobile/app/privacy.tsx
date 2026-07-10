import React from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, Linking, Pressable } from 'react-native';

const BRAND = '#F7A800';

const SECTIONS = [
  {
    title: '1. Information We Collect',
    body: 'We collect information you provide directly to us, such as when you create an account, place an order, or contact support. This includes your name, email address, phone number, delivery addresses, and payment information.\n\nWe also collect information automatically when you use our app, including device information, IP address, app usage data, and location data (with your permission) to enable hyperlocal delivery features.',
  },
  {
    title: '2. How We Use Your Information',
    body: 'We use the information we collect to:\n• Process and deliver your orders\n• Send order confirmations and delivery updates\n• Personalise your shopping experience\n• Improve our app and services\n• Detect and prevent fraud\n• Comply with legal obligations\n• Communicate promotions and offers (with your consent)',
  },
  {
    title: '3. Sharing Your Information',
    body: 'We share your information with:\n• Shop vendors — to fulfil your orders (name, address, phone)\n• Delivery riders — to complete delivery (name, address, phone)\n• Payment processors — to securely process transactions\n• Service providers — who assist us in operating our platform\n\nWe do not sell your personal data to third parties for advertising purposes.',
  },
  {
    title: '4. Location Data',
    body: 'With your permission, we collect real-time location data to show nearby shops, provide accurate delivery estimates, and track your delivery rider. You can disable location access at any time in your device settings, though this may affect the delivery experience.',
  },
  {
    title: '5. Data Retention',
    body: 'We retain your account information for as long as your account is active. Order history is retained for 7 years for legal and accounting purposes. You may request deletion of your account and associated data by contacting support@swiftmart.in.',
  },
  {
    title: '6. Security',
    body: 'We implement industry-standard security measures including encryption in transit (TLS), encrypted storage of sensitive data, and regular security audits. However, no system is completely secure — please keep your account credentials confidential and contact us immediately if you suspect unauthorised access.',
  },
  {
    title: '7. Your Rights',
    body: 'You have the right to:\n• Access the personal data we hold about you\n• Correct inaccurate data\n• Request deletion of your data\n• Opt out of marketing communications\n• Withdraw consent for optional data processing\n\nTo exercise these rights, contact us at privacy@swiftmart.in.',
  },
  {
    title: '8. Cookies & Tracking',
    body: 'Our app uses analytics tools to understand how users interact with the app. This data is aggregated and anonymised. We do not use third-party advertising trackers.',
  },
  {
    title: "9. Children's Privacy",
    body: 'SwiftMart is intended for users aged 18 and above only. We do not knowingly collect personal information from anyone under 18 years of age. If we become aware that a person under 18 has provided us with personal data, we will delete that information immediately and terminate the associated account.',
  },
  {
    title: '10. Changes to This Policy',
    body: 'We may update this Privacy Policy from time to time. We will notify you of significant changes via app notification or email. Continued use of the app after changes constitutes acceptance of the updated policy.',
  },
  {
    title: '11. Contact Us',
    body: 'For privacy-related questions or concerns, contact our Data Protection Officer at:\n\nEmail: privacy@swiftmart.in\nAddress: SwiftMart Technologies Pvt. Ltd.\nMG Road, Kolkata, West Bengal – 700001, India',
  },
];

export default function PrivacyPolicyPage() {
  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => Linking.openURL('https://swiftmart.space')} style={styles.logoRow}>
          <Text style={styles.logoText}>⚡ SwiftMart</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.pageTitle}>Privacy Policy</Text>
        <View style={styles.badgeRow}>
          <Text style={styles.badge}>Effective: 1 January 2026</Text>
          <Text style={styles.badge}>Last updated: 1 July 2026</Text>
        </View>
        <Text style={styles.intro}>
          SwiftMart ("we", "us", "our") is committed to protecting your privacy. This policy explains
          how we collect, use, share, and protect your personal information when you use the
          SwiftMart app.
        </Text>

        {SECTIONS.map(s => (
          <View key={s.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{s.title}</Text>
            <Text style={styles.sectionBody}>{s.body}</Text>
          </View>
        ))}

        <View style={styles.footer}>
          <Text style={styles.footerText}>© {new Date().getFullYear()} SwiftMart Technologies Pvt. Ltd. · </Text>
          <Pressable onPress={() => Linking.openURL('https://swiftmart.space/terms')}>
            <Text style={[styles.footerText, styles.link]}>Terms of Service</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  header: {
    backgroundColor: '#111',
    paddingVertical: 16,
    paddingHorizontal: 24,
    ...(Platform.OS === 'web' ? { position: 'sticky' as any, top: 0, zIndex: 10 } : {}),
  },
  logoRow: { flexDirection: 'row', alignItems: 'center' },
  logoText: { color: BRAND, fontSize: 20, fontWeight: '800', letterSpacing: 0.5 },
  body: {
    padding: 24,
    maxWidth: 760,
    alignSelf: 'center',
    width: '100%',
    gap: 24,
    paddingBottom: 80,
  },
  pageTitle: { fontSize: 28, fontWeight: '800', color: '#111', marginTop: 8 },
  badgeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  badge: {
    backgroundColor: '#FFF8E7',
    color: '#92600A',
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    overflow: 'hidden',
  },
  intro: { fontSize: 15, lineHeight: 26, color: '#555' },
  section: { gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  sectionBody: { fontSize: 14, lineHeight: 24, color: '#444' },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 20,
    marginTop: 12,
  },
  footerText: { fontSize: 13, color: '#999' },
  link: { color: BRAND, textDecorationLine: 'underline' },
});
