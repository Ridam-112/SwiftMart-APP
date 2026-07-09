import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { Order, OrderStatus } from '@/lib/types';

interface Props { order: Order; onPress: () => void; }

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; icon: string }> = {
  pending:          { label: 'Pending',          color: '#F59E0B', icon: 'time-outline' },
  confirmed:        { label: 'Confirmed',         color: '#3B82F6', icon: 'checkmark-circle-outline' },
  preparing:        { label: 'Preparing',         color: '#8B5CF6', icon: 'restaurant-outline' },
  ready:            { label: 'Ready',             color: '#06B6D4', icon: 'bag-check-outline' },
  out_for_delivery: { label: 'Out for Delivery',  color: '#F97316', icon: 'bicycle-outline' },
  delivered:        { label: 'Delivered',         color: '#22C55E', icon: 'checkmark-done-circle-outline' },
  cancelled:        { label: 'Cancelled',         color: '#EF4444', icon: 'close-circle-outline' },
};

export function OrderCard({ order, onPress }: Props) {
  const colors = useColors();
  const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending;
  const shopName = typeof order.shop === 'object' ? order.shop.name : 'Shop';
  const itemCount = order.items?.length ?? 0;
  const date = new Date(order.createdAt).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.header}>
        <View style={styles.shopRow}>
          <Ionicons name="storefront-outline" size={16} color={colors.primary} />
          <Text style={[styles.shopName, { color: colors.foreground }]} numberOfLines={1}>
            {shopName}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: cfg.color + '20' }]}>
          <Ionicons name={cfg.icon as 'time-outline'} size={12} color={cfg.color} />
          <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <View style={styles.footer}>
        <Text style={[styles.meta, { color: colors.mutedForeground }]}>
          {itemCount} item{itemCount !== 1 ? 's' : ''} · {date}
        </Text>
        <Text style={[styles.amount, { color: colors.foreground }]}>
          ₹{order.totalAmount?.toFixed(0)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
    overflow: 'hidden',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 },
  shopRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  shopName: { fontSize: 15, fontWeight: '700', flex: 1 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20,
  },
  badgeText: { fontSize: 11, fontWeight: '600' },
  divider: { height: 1, marginHorizontal: 14 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 },
  meta: { fontSize: 13 },
  amount: { fontSize: 16, fontWeight: '700' },
});
