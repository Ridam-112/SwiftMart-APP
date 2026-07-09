import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, Alert, Platform } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { api, extractList } from '@/lib/api';
import { Order, RiderStats } from '@/lib/types';

export default function RiderDashboard() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const qc = useQueryClient();
  const topPad = Platform.OS === 'web' ? 20 : insets.top;

  const { data: stats } = useQuery<RiderStats>({
    queryKey: ['rider-stats'],
    queryFn: async () => {
      try { return await api.get<RiderStats>('/delivery/stats'); } catch { return {}; }
    },
  });

  const { data: available = [], isLoading, refetch, isRefetching } = useQuery<Order[]>({
    queryKey: ['rider-available'],
    queryFn: async () => {
      const res = await api.get<unknown>('/delivery/orders');
      return extractList<Order>(res, 'orders');
    },
    refetchInterval: 20000,
  });

  async function acceptDelivery(orderId: string) {
    try {
      await api.patch(`/delivery/orders/${orderId}/accept`, {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ['rider-available'] });
      qc.invalidateQueries({ queryKey: ['rider-deliveries'] });
      router.push({ pathname: '/rider-delivery/[id]', params: { id: orderId } });
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not accept delivery.');
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={available}
        keyExtractor={o => o._id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 90 + insets.bottom }}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />}
        ListHeaderComponent={
          <>
            {/* Header */}
            <LinearGradient colors={['#EA580C', '#F97316']} style={[styles.header, { paddingTop: topPad + 12 }]}>
              <Text style={styles.greeting}>Ready to deliver?</Text>
              <Text style={styles.name}>{user?.name}</Text>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{stats?.todayDeliveries ?? 0}</Text>
                  <Text style={styles.statLabel}>Today</Text>
                </View>
                <View style={[styles.statDivider]} />
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>₹{stats?.todayEarnings ?? 0}</Text>
                  <Text style={styles.statLabel}>Earned</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{stats?.totalDeliveries ?? 0}</Text>
                  <Text style={styles.statLabel}>Total</Text>
                </View>
              </View>
            </LinearGradient>

            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              Available Deliveries {available.length > 0 && `(${available.length})`}
            </Text>
          </>
        }
        renderItem={({ item: order }) => {
          const shop = typeof order.shop === 'object' ? order.shop : null;
          const addr = order.deliveryAddress;
          return (
            <View style={[styles.orderCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.cardHeader}>
                <Ionicons name="storefront-outline" size={16} color={colors.primary} />
                <Text style={[styles.shopName, { color: colors.foreground }]}>{shop?.name ?? 'Shop'}</Text>
                <Text style={[styles.amount, { color: colors.accent }]}>₹{order.totalAmount?.toFixed(0)}</Text>
              </View>
              {addr && (
                <View style={styles.addrRow}>
                  <Ionicons name="location-outline" size={14} color={colors.mutedForeground} />
                  <Text style={[styles.addrText, { color: colors.mutedForeground }]} numberOfLines={2}>
                    {[addr.street, addr.city].filter(Boolean).join(', ')}
                  </Text>
                </View>
              )}
              <Text style={[styles.itemCount, { color: colors.mutedForeground }]}>
                {order.items?.length ?? 0} items
              </Text>
              <TouchableOpacity
                style={[styles.acceptBtn, { backgroundColor: colors.accent }]}
                onPress={() => acceptDelivery(order._id)}
                activeOpacity={0.85}
              >
                <Ionicons name="bicycle-outline" size={18} color="#fff" />
                <Text style={styles.acceptBtnText}>Accept Delivery</Text>
              </TouchableOpacity>
            </View>
          );
        }}
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 60 }} />
          ) : (
            <View style={styles.empty}>
              <Ionicons name="bicycle-outline" size={56} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No deliveries nearby</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Check back soon</Text>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 24 },
  greeting: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  name: { color: '#fff', fontSize: 22, fontWeight: '800', marginTop: 2 },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 14, padding: 14 },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { color: '#fff', fontSize: 20, fontWeight: '800' },
  statLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 },
  statDivider: { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.3)' },
  sectionTitle: { fontSize: 18, fontWeight: '700', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 },
  orderCard: { borderRadius: 14, borderWidth: 1, margin: 12, marginTop: 4, padding: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  shopName: { flex: 1, fontSize: 15, fontWeight: '700' },
  amount: { fontSize: 16, fontWeight: '800' },
  addrRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginBottom: 6 },
  addrText: { fontSize: 13, flex: 1 },
  itemCount: { fontSize: 12, marginBottom: 12 },
  acceptBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: 10 },
  acceptBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyTitle: { fontSize: 20, fontWeight: '700' },
  emptyText: { fontSize: 14 },
});
