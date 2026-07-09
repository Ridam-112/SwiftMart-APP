import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';

export default function VendorProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const topPad = Platform.OS === 'web' ? 20 : insets.top;
  const initials = user?.name?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() ?? '?';

  function handleLogout() {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); await logout(); } },
    ]);
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: 90 + insets.bottom }}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Vendor Profile</Text>
      </View>

      <View style={[styles.avatarSection, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={[styles.avatar, { backgroundColor: '#8B5CF6' }]}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: colors.foreground }]}>{user?.name}</Text>
          <Text style={[styles.email, { color: colors.mutedForeground }]}>{user?.email}</Text>
          {user?.phone && <Text style={[styles.phone, { color: colors.mutedForeground }]}>{user.phone}</Text>}
        </View>
        <View style={[styles.badge, { backgroundColor: '#F5F3FF' }]}>
          <Text style={[styles.badgeText, { color: '#7C3AED' }]}>Vendor</Text>
        </View>
      </View>

      <View style={[styles.menuCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {[
          { icon: 'storefront-outline', label: 'Shop Settings',    sub: 'Name, timings, delivery area', onPress: () => router.push('/(vendor)/shop-settings') },
          { icon: 'card-outline',       label: 'Payout Settings',  sub: 'Bank account & UPI' },
          { icon: 'help-circle-outline',label: 'Help & Support' },
          { icon: 'log-out-outline',    label: 'Sign Out', danger: true, onPress: handleLogout },
        ].map((item, i, arr) => (
          <TouchableOpacity
            key={item.label}
            style={[styles.menuItem, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
            onPress={item.onPress ?? (() => {})}
            activeOpacity={0.7}
          >
            <View style={[styles.menuIcon, { backgroundColor: item.danger ? '#FEE2E2' : colors.secondary }]}>
              <Ionicons name={item.icon as 'storefront-outline'} size={20} color={item.danger ? colors.destructive : colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuLabel, { color: item.danger ? colors.destructive : colors.foreground }]}>{item.label}</Text>
              {item.sub && <Text style={[styles.menuSub, { color: colors.mutedForeground }]}>{item.sub}</Text>}
            </View>
            {!item.danger && <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />}
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  headerTitle: { fontSize: 22, fontWeight: '800' },
  avatarSection: { flexDirection: 'row', alignItems: 'center', padding: 20, gap: 14, borderBottomWidth: 1, marginBottom: 16 },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 22, fontWeight: '700' },
  name: { fontSize: 18, fontWeight: '700' },
  email: { fontSize: 13, marginTop: 2 },
  phone: { fontSize: 13 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  menuCard: { marginHorizontal: 16, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  menuIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { fontSize: 15, fontWeight: '600' },
  menuSub: { fontSize: 12, marginTop: 1 },
});
