import React from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, Linking, Pressable } from 'react-native';

const BRAND = '#F7A800';

const SECTIONS = [
  {
    title: '1. Acceptance of Terms',
    body: 'By downloading, installing, or using the SwiftMart app, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the app. These terms apply to all users including customers, vendors, and delivery riders.',
  },
  {
    title: '2. Eligibility',
    body: 'You must be at least 18 years old to create an account and use SwiftMart. By using the app, you represent that you are 18 or older and have the legal capacity to enter into these Terms.',
  },
  {
    title: '3. Account Registration',
    body: 'You agree to provide accurate, current, and complete information during registration. You are responsible for maintaining the confidentiality of your account credentials. You are responsible for all activity under your account. Notify us immediately at support@swiftmart.in if you suspect unauthorised access.',
  },
  {
    title: '4. Placing Orders',
    body: 'When you place an order through SwiftMart, you are making an offer to purchase the listed products from the vendor. The order is confirmed when the vendor accepts it. Prices are set by vendors and may change. SwiftMart displays prices inclusive of applicable taxes unless stated otherwise.',
  },
  {
    title: '5. Delivery',
    body: 'Delivery times are estimates and may vary due to distance, traffic, weather, and rider availability. SwiftMart is not liable for delays outside its reasonable control. You must be available to receive the delivery at the provided address. Undeliverable orders may be cancelled.',
  },
  {
    title: '6. Cancellations & Refunds',
    body: 'You may cancel an order within 5 minutes of placing it, provided the vendor has not yet confirmed. Once confirmed, cancellation may not be possible. Refunds for valid cancellations or order issues are processed within 5–7 business days. Refunds for cash-on-delivery orders will be issued as wallet credits.',
  },
  {
    title: '7. Prohibited Conduct',
    body: 'You agree not to:\n• Use the app for any unlawful purpose\n• Place fraudulent orders\n• Abuse, harass, or threaten vendors or riders\n• Attempt to reverse-engineer or interfere with the app\n• Create multiple accounts to abuse promotions\n• Provide false information\n\nViolations may result in account suspension or termination.',
  },
  {
    title: '8. Vendor Relationship',
    body: 'SwiftMart is a platform connecting customers with independent local vendors. Vendors are solely responsible for the quality, safety, and accuracy of their listed products. SwiftMart does not guarantee product quality but provides a dispute resolution mechanism.',
  },
  {
    title: '9. Intellectual Property',
    body: 'All content in the SwiftMart app — including logos, design, text, and software — is the property of SwiftMart Technologies Pvt. Ltd. and protected by applicable intellectual property laws. You may not copy, reproduce, or distribute any content without written permission.',
  },
  {
    title: '10. Limitation of Liability',
    body: 'To the maximum extent permitted by law, SwiftMart shall not be liable for indirect, incidental, special, or consequential damages arising from your use of the app. Our total liability for any claim shall not exceed the amount you paid for the order giving rise to the claim.',
  },
  {
    title: '11. Modifications to Terms',
    body: 'We may update these Terms at any time. Material changes will be communicated via app notification or email at least 7 days before taking effect. Continued use of the app after changes take effect constitutes acceptance of the updated Terms.',
  },
  {
    title: '12. Governing Law',
    body: 'These Terms are governed by the laws of India. Any disputes arising from these Terms or your use of SwiftMart shall be subject to the exclusive jurisdiction of the courts of Kolkata, West Bengal.',
  },
  {
    title: '13. Contact',
    body: 'For questions about these Terms, contact us at:\n\nEmail: legal@swiftmart.in\nAddress: SwiftMart Technologies Pvt. Ltd.\nMG Road, Kolkata, West Bengal – 700001, India',
  },
];

export default function TermsOfServicePage() {
  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => Linking.openURL('https://swiftmart.space')} style={styles.logoRow}>
          <Text style={styles.logoText}>⚡ SwiftMart</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.pageTitle}>Terms of Service</Text>
        <View style={styles.badgeRow}>
          <Text style={styles.badge}>Effective: 1 January 2026</Text>
          <Text style={styles.badge}>Last updated: 1 July 2026</Text>
        </View>
        <Text style={styles.intro}>
          These Terms of Service ("Terms") govern your use of the SwiftMart mobile application and
          related services operated by SwiftMart Technologies Pvt. Ltd. Please read these Terms
          carefully before using the app.
        </Text>

        {SECTIONS.map(s => (
          <View key={s.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{s.title}</Text>
            <Text style={styles.sectionBody}>{s.body}</Text>
          </View>
        ))}

        <View style={styles.footer}>
          <Text style={styles.footerText}>© {new Date().getFullYear()} SwiftMart Technologies Pvt. Ltd. · </Text>
          <Pressable onPress={() => Linking.openURL('https://swiftmart.space/privacy')}>
            <Text style={[styles.footerText, styles.link]}>Privacy Policy</Text>
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
