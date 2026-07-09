import React from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Platform } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { OrderCard } from '@/components/OrderCard';
import { api, extractList } from '@/lib/api';
import { Order, VendorStats } from '@/lib/types';

interface StatCardProps { label: string; value: string | number; icon: string; color: string; bg: string; }
function StatCard({ label, value, icon, color, bg }: StatCardProps) {
  const colors = useColors();
  return (
    <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.statIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon as 'bag'} size={22} color={color} />
      </View>
      <Text style={[styles.statValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

export default function VendorDashboard() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const topPad = Platform.OS === 'web' ? 20 : insets.top;

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery<VendorStats>({
    queryKey: ['vendor-stats'],
    queryFn: async () => {
      try {
        const res = await api.get<VendorStats>('/vendor/dashboard');
        return res;
      } catch { return {}; }
    },
  });

  const { data: orders = [], isLoading: ordersLoading, refetch: refetchOrders, isRefetching } = useQuery<Order[]>({
    queryKey: ['vendor-orders-recent'],
    queryFn: async () => {
      const res = await api.get<unknown>('/vendor/orders');
      return extractList<Order>(res, 'orders').slice(0, 5);
    },
  });

  function refetch() { refetchStats(); refetchOrders(); }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: 90 + insets.bottom }}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <LinearGradient colors={['#15803D', '#22C55E']} style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Text style={styles.greeting}>Welcome back,</Text>
        <Text style={styles.name}>{user?.name}</Text>
        <Text style={styles.role}>Vendor Dashboard</Text>
      </LinearGradient>

      {/* Stats grid */}
      <View style={styles.statsGrid}>
        <StatCard label="Today's Orders"  value={stats?.todayOrders ?? 0}  icon="bag"               color="#3B82F6" bg="#EFF6FF" />
        <StatCard label="Today's Revenue" value={`₹${stats?.todayRevenue ?? 0}`} icon="trending-up" color="#22C55E" bg="#F0FDF4" />
        <StatCard label="Pending"         value={stats?.pendingOrders ?? 0} icon="time-outline"      color="#F59E0B" bg="#FFFBEB" />
        <StatCard label="Total Orders"    value={stats?.totalOrders ?? 0}   icon="receipt-outline"   color="#8B5CF6" bg="#F5F3FF" />
      </View>

      {/* Recent orders */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recent Orders</Text>
          <Text
            style={[styles.seeAll, { color: colors.primary }]}
            onPress={() => router.push('/(vendor)/orders')}
          >
            See all
          </Text>
        </View>
        {ordersLoading ? (
          <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 20 }} />
        ) : orders.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="receipt-outline" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No recent orders</Text>
          </View>
        ) : (
          orders.map(o => (
            <OrderCard
              key={o._id}
              order={o}
              onPress={() => router.push({ pathname: '/order/[id]', params: { id: o._id } })}
            />
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 28 },
  greeting: { color: 'rgba(255,255,255,0.85)', fontSize: 14 },
  name: { color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 2 },
  role: { color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 2 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 0 },
  statCard: {
    width: '48%', margin: '1%', borderRadius: 14, borderWidth: 1, padding: 14,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4,
  },
  statIcon: { width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  statValue: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 12, marginTop: 2 },
  section: { paddingHorizontal: 16, paddingTop: 8 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '700' },
  seeAll: { fontSize: 14, fontWeight: '600' },
  empty: { alignItems: 'center', paddingVertical: 32, gap: 8 },
  emptyText: { fontSize: 14 },
});
