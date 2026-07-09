import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { Order, OrderStatus, OrderItem, Product } from '@/lib/types';

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

function getShopName(order: Order): string {
  if (typeof order.shop === 'object' && order.shop !== null) {
    return order.shop.name ?? order.shop.shopName ?? 'Shop';
  }
  // Try to pull shop name from the first populated product
  if (order.items?.length) {
    const firstProduct = order.items[0]?.product;
    if (typeof firstProduct === 'object' && firstProduct !== null) {
      const p = firstProduct as Product;
      if (p.shopName) return p.shopName;
    }
  }
  return 'Shop';
}

function getItemLabel(item: OrderItem): string {
  if (typeof item.product === 'object' && item.product !== null) {
    return (item.product as Product).name ?? 'Item';
  }
  return 'Item';
}

function getTotal(order: Order): string {
  if (order.totalAmount != null && !isNaN(order.totalAmount)) {
    return `₹${order.totalAmount.toFixed(0)}`;
  }
  // Fallback: sum items
  const sum = order.items?.reduce((acc, i) => acc + (i.price ?? 0) * (i.quantity ?? 1), 0) ?? 0;
  return sum > 0 ? `₹${sum.toFixed(0)}` : '₹—';
}

export function OrderCard({ order, onPress }: Props) {
  const colors = useColors();
  const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending;
  const shopName = getShopName(order);
  const date = new Date(order.createdAt).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  // Show up to 3 items, then "+ N more"
  const items = order.items ?? [];
  const shownItems = items.slice(0, 3);
  const extraCount = items.length - shownItems.length;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {/* Shop name + status badge */}
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

      {/* Items list */}
      {shownItems.length > 0 && (
        <View style={[styles.itemsBlock, { borderTopColor: colors.border }]}>
          {shownItems.map((item, idx) => (
            <View key={idx} style={styles.itemRow}>
              <Text style={[styles.itemQty, { color: colors.primary }]}>
                {item.quantity ?? 1}×
              </Text>
              <Text style={[styles.itemName, { color: colors.foreground }]} numberOfLines={1}>
                {getItemLabel(item)}
              </Text>
              {item.price != null && (
                <Text style={[styles.itemPrice, { color: colors.mutedForeground }]}>
                  ₹{(item.price * (item.quantity ?? 1)).toFixed(0)}
                </Text>
              )}
            </View>
          ))}
          {extraCount > 0 && (
            <Text style={[styles.moreItems, { color: colors.mutedForeground }]}>
              +{extraCount} more item{extraCount !== 1 ? 's' : ''}
            </Text>
          )}
        </View>
      )}

      {/* Footer: date + total */}
      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <Text style={[styles.date, { color: colors.mutedForeground }]}>{date}</Text>
        <Text style={[styles.amount, { color: colors.foreground }]}>
          {getTotal(order)}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  shopRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  shopName: { fontSize: 15, fontWeight: '700', flex: 1 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
  },
  badgeText: { fontSize: 11, fontWeight: '600' },
  itemsBlock: {
    borderTopWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 5,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  itemQty: { fontSize: 13, fontWeight: '700', minWidth: 24 },
  itemName: { fontSize: 13, flex: 1 },
  itemPrice: { fontSize: 13, fontWeight: '500' },
  moreItems: { fontSize: 12, marginTop: 2 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderTopWidth: 1,
  },
  date: { fontSize: 13 },
  amount: { fontSize: 16, fontWeight: '800' },
});
