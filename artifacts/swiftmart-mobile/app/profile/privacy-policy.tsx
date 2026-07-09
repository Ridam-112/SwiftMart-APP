import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { ScreenHeader } from '@/components/ScreenHeader';

const SECTIONS = [
  {
    title: '1. Information We Collect',
    body: 'We collect information you provide directly to us, such as when you create an account, place an order, or contact support. This includes your name, email address, phone number, delivery addresses, and payment information.\n\nWe also collect information automatically when you use our app, including device information, IP address, app usage data, and location data (with your permission) to enable hyperlocal delivery features.',
  },
  {
    title: '2. How We Use Your Information',
    body: 'We use the information we collect to:\n• Process and deliver your orders\n• Send order confirmations and delivery updates\n• Personalize your shopping experience\n• Improve our app and services\n• Detect and prevent fraud\n• Comply with legal obligations\n• Communicate promotions and offers (with your consent)',
  },
  {
    title: '3. Sharing Your Information',
    body: 'We share your information with:\n• Shop vendors — to fulfill your orders (name, address, phone)\n• Delivery riders — to complete delivery (name, address, phone)\n• Payment processors — to securely process transactions\n• Service providers — who assist us in operating our platform\n\nWe do not sell your personal data to third parties for advertising purposes.',
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
    title: '9. Children\'s Privacy',
    body: 'SwiftMart is not intended for users under 13 years of age. We do not knowingly collect personal information from children under 13. If we become aware that we have collected such information, we will delete it promptly.',
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

export default function PrivacyPolicyScreen() {
  const colors = useColors();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Privacy Policy" />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={[styles.effectiveBox, { backgroundColor: colors.secondary }]}>
          <Text style={[styles.effectiveText, { color: colors.secondaryForeground }]}>
            Effective Date: 1 January 2026 · Last Updated: 1 July 2026
          </Text>
        </View>
        <Text style={[styles.intro, { color: colors.mutedForeground }]}>
          SwiftMart ("we", "us", "our") is committed to protecting your privacy. This policy explains how we collect, use, share, and protect your personal information when you use the SwiftMart app.
        </Text>
        {SECTIONS.map(s => (
          <View key={s.title} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{s.title}</Text>
            <Text style={[styles.sectionBody, { color: colors.mutedForeground }]}>{s.body}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { padding: 20, gap: 20, paddingBottom: 60 },
  effectiveBox: { padding: 12, borderRadius: 10 },
  effectiveText: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  intro: { fontSize: 14, lineHeight: 22 },
  section: { gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
  sectionBody: { fontSize: 14, lineHeight: 22 },
});
