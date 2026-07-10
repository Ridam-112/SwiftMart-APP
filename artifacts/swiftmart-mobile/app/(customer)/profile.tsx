import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { showAlert } from '@/lib/alert';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';

interface MenuItem { icon: string; label: string; sub?: string; onPress?: () => void; danger?: boolean; }

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const topPad = Platform.OS === 'web' ? 20 : insets.top;

  const initials = user?.name?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() ?? '?';

  function handleLogout() {
    showAlert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive',
        onPress: async () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); await logout(); },
      },
    ]);
  }

  const menuItems: MenuItem[] = [
    { icon: 'person-outline',        label: 'Edit Profile',     sub: 'Update name, email & phone', onPress: () => router.push('/profile/edit') },
    { icon: 'location-outline',      label: 'Saved Addresses',  sub: 'Manage delivery addresses',  onPress: () => router.push('/profile/addresses') },
    { icon: 'heart-outline',         label: 'Wishlist',         sub: 'Your saved items',           onPress: () => router.push('/profile/wishlist') },
    { icon: 'card-outline',          label: 'Payment Methods',  sub: 'Add & manage payments',      onPress: () => router.push('/profile/payment-methods') },
    { icon: 'help-circle-outline',   label: 'Help & Support',   sub: 'FAQs and contact us',        onPress: () => router.push('/profile/help') },
    { icon: 'shield-outline',        label: 'Privacy Policy',                                      onPress: () => router.push('/profile/privacy-policy') },
    { icon: 'document-text-outline', label: 'Terms of Service',                                    onPress: () => router.push('/profile/terms') },
    { icon: 'log-out-outline',       label: 'Sign Out', danger: true, onPress: handleLogout },
  ];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: 90 + insets.bottom }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Profile</Text>
      </View>

      {/* Avatar */}
      <View style={[styles.avatarSection, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.userInfo}>
          <Text style={[styles.userName, { color: colors.foreground }]}>{user?.name}</Text>
          <Text style={[styles.userEmail, { color: colors.mutedForeground }]}>{user?.email}</Text>
          {user?.phone && (
            <Text style={[styles.userPhone, { color: colors.mutedForeground }]}>{user.phone}</Text>
          )}
        </View>
        <View style={[styles.roleBadge, { backgroundColor: colors.secondary }]}>
          <Text style={[styles.roleText, { color: colors.primary }]}>
            {user?.role?.charAt(0).toUpperCase()}{user?.role?.slice(1)}
          </Text>
        </View>
      </View>

      {/* Menu */}
      <View style={[styles.menuCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {menuItems.map((item, i) => (
          <TouchableOpacity
            key={item.label}
            style={[
              styles.menuItem,
              i < menuItems.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
            ]}
            onPress={item.onPress ?? (() => {})}
            activeOpacity={0.7}
          >
            <View style={[styles.menuIcon, { backgroundColor: item.danger ? '#FEE2E2' : colors.secondary }]}>
              <Ionicons
                name={item.icon as 'person-outline'}
                size={20}
                color={item.danger ? colors.destructive : colors.primary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuLabel, { color: item.danger ? colors.destructive : colors.foreground }]}>
                {item.label}
              </Text>
              {item.sub && <Text style={[styles.menuSub, { color: colors.mutedForeground }]}>{item.sub}</Text>}
            </View>
            {!item.danger && (
              <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
            )}
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
  avatarSection: {
    flexDirection: 'row', alignItems: 'center', padding: 20, gap: 14,
    borderBottomWidth: 1, marginBottom: 16,
  },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 22, fontWeight: '700' },
  userInfo: { flex: 1 },
  userName: { fontSize: 18, fontWeight: '700' },
  userEmail: { fontSize: 13, marginTop: 2 },
  userPhone: { fontSize: 13, marginTop: 1 },
  roleBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  roleText: { fontSize: 12, fontWeight: '600' },
  menuCard: { marginHorizontal: 16, borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
  menuIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { fontSize: 15, fontWeight: '600' },
  menuSub: { fontSize: 12, marginTop: 1 },
});
