import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator, TouchableOpacity, Alert, Platform } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { api, extractList } from '@/lib/api';
import { Order } from '@/lib/types';

export default function VendorOrdersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const topPad = Platform.OS === 'web' ? 20 : insets.top;

  const { data: orders = [], isLoading, refetch, isRefetching } = useQuery<Order[]>({
    queryKey: ['vendor-orders'],
    queryFn: async () => {
      const res = await api.get<unknown>('/vendor/orders');
      return extractList<Order>(res, 'orders').sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    },
    refetchInterval: 30000,
  });

  async function updateStatus(orderId: string, status: string) {
    try {
      await api.patch(`/vendor/orders/${orderId}/status`, { status });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ['vendor-orders'] });
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not update order status.');
    }
  }

  const STATUS_COLORS: Record<string, string> = {
    pending: '#F59E0B', confirmed: '#3B82F6', preparing: '#8B5CF6',
    ready: '#06B6D4', out_for_delivery: '#F97316', delivered: '#22C55E', cancelled: '#EF4444',
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Incoming Orders</Text>
        {orders.length > 0 && (
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>{orders.length} orders</Text>
        )}
      </View>

      <FlatList
        data={orders}
        keyExtractor={o => o._id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.list, { paddingBottom: 90 + insets.bottom }]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
        renderItem={({ item: order }) => {
          const sc = STATUS_COLORS[order.status] ?? '#6B7280';
          const canConfirm = order.status === 'pending';
          const canPrepare = order.status === 'confirmed';
          const canReady = order.status === 'preparing';

          return (
            <View style={[styles.orderCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.orderHeader}>
                <Text style={[styles.orderId, { color: colors.foreground }]}>
                  #{order._id.slice(-6).toUpperCase()}
                </Text>
                <View style={[styles.statusBadge, { backgroundColor: sc + '20' }]}>
                  <Text style={[styles.statusText, { color: sc }]}>{order.status.replace('_', ' ')}</Text>
                </View>
              </View>
              <Text style={[styles.orderMeta, { color: colors.mutedForeground }]}>
                {order.items?.length ?? 0} items · ₹{order.totalAmount?.toFixed(0)} · {order.paymentMethod?.toUpperCase()}
              </Text>
              {order.items?.slice(0, 3).map((item, i) => {
                const p = typeof item.product === 'object' ? item.product : null;
                return (
                  <Text key={i} style={[styles.itemLine, { color: colors.mutedForeground }]}>
                    • {item.quantity}× {p?.name ?? 'Item'}
                  </Text>
                );
              })}
              {/* Action buttons */}
              <View style={styles.actions}>
                {canConfirm && (
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                    onPress={() => updateStatus(order._id, 'confirmed')}
                  >
                    <Text style={styles.actionBtnText}>Accept</Text>
                  </TouchableOpacity>
                )}
                {canPrepare && (
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#8B5CF6' }]}
                    onPress={() => updateStatus(order._id, 'preparing')}
                  >
                    <Text style={styles.actionBtnText}>Start Preparing</Text>
                  </TouchableOpacity>
                )}
                {canReady && (
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#06B6D4' }]}
                    onPress={() => updateStatus(order._id, 'ready')}
                  >
                    <Text style={styles.actionBtnText}>Mark Ready</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.detailBtn, { borderColor: colors.border }]}
                  onPress={() => router.push({ pathname: '/order/[id]', params: { id: order._id } })}
                >
                  <Text style={[styles.detailBtnText, { color: colors.foreground }]}>Details</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
          ) : (
            <View style={styles.empty}>
              <Ionicons name="receipt-outline" size={56} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No orders yet</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Orders will appear here</Text>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  headerTitle: { fontSize: 22, fontWeight: '800' },
  headerSub: { fontSize: 13, marginTop: 2 },
  list: { padding: 16, gap: 10 },
  orderCard: { borderRadius: 14, borderWidth: 1, padding: 14 },
  orderHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  orderId: { fontSize: 15, fontWeight: '700' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  orderMeta: { fontSize: 13, marginBottom: 6 },
  itemLine: { fontSize: 13, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  actionBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  actionBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  detailBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  detailBtnText: { fontSize: 13, fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyTitle: { fontSize: 20, fontWeight: '700' },
  emptyText: { fontSize: 14 },
});
