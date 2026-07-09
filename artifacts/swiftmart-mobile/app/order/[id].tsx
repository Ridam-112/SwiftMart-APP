import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { api } from '@/lib/api';
import { Order, OrderStatus } from '@/lib/types';

const STATUS_STEPS: { key: OrderStatus; label: string; icon: string }[] = [
  { key: 'pending',          label: 'Order Placed',    icon: 'bag-outline' },
  { key: 'confirmed',        label: 'Confirmed',       icon: 'checkmark-circle-outline' },
  { key: 'preparing',        label: 'Preparing',       icon: 'restaurant-outline' },
  { key: 'ready',            label: 'Ready',           icon: 'bag-check-outline' },
  { key: 'out_for_delivery', label: 'Out for Delivery', icon: 'bicycle-outline' },
  { key: 'delivered',        label: 'Delivered',       icon: 'checkmark-done-circle-outline' },
];

const STATUS_ORDER: Record<OrderStatus, number> = {
  pending: 0, confirmed: 1, preparing: 2, ready: 3, out_for_delivery: 4, delivered: 5, cancelled: -1,
};

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 20 : insets.top;

  const { data: order, isLoading } = useQuery<Order>({
    queryKey: ['order', id],
    queryFn: async () => {
      const res = await api.get<Record<string, unknown>>(`/orders/${id}`);
      return (res.order ?? res) as Order;
    },
    enabled: !!id,
    refetchInterval: 30000, // refresh every 30s for live tracking
  });

  if (isLoading) {
    return (
      <View style={[styles.loader, { paddingTop: topPad }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={[styles.loader, { paddingTop: topPad }]}>
        <Text style={{ color: colors.mutedForeground }}>Order not found</Text>
      </View>
    );
  }

  const shopName = typeof order.shop === 'object' ? order.shop.name : 'Shop';
  const currentStep = STATUS_ORDER[order.status] ?? 0;
  const isCancelled = order.status === 'cancelled';
  const date = new Date(order.createdAt).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Order Details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        {/* Order meta */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>{shopName}</Text>
          <Text style={[styles.orderId, { color: colors.mutedForeground }]}>Order #{order._id.slice(-8).toUpperCase()}</Text>
          <Text style={[styles.orderDate, { color: colors.mutedForeground }]}>{date}</Text>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.payRow}>
            <Ionicons name="cash-outline" size={16} color={colors.primary} />
            <Text style={[styles.payText, { color: colors.foreground }]}>
              {order.paymentMethod === 'cod' ? 'Cash on Delivery' : order.paymentMethod}
            </Text>
          </View>
        </View>

        {/* Status tracker */}
        {!isCancelled ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 12 }]}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Order Status</Text>
            {STATUS_STEPS.map((step, i) => {
              const done = currentStep >= i;
              const active = currentStep === i;
              return (
                <View key={step.key} style={styles.stepRow}>
                  <View style={styles.stepLeft}>
                    <View style={[
                      styles.stepDot,
                      { backgroundColor: done ? colors.primary : colors.muted, borderColor: active ? colors.primary : 'transparent' },
                    ]}>
                      <Ionicons name={step.icon as 'bag-outline'} size={14} color={done ? '#fff' : colors.mutedForeground} />
                    </View>
                    {i < STATUS_STEPS.length - 1 && (
                      <View style={[styles.stepLine, { backgroundColor: currentStep > i ? colors.primary : colors.border }]} />
                    )}
                  </View>
                  <View style={styles.stepContent}>
                    <Text style={[styles.stepLabel, { color: done ? colors.foreground : colors.mutedForeground, fontWeight: active ? '700' : '400' }]}>
                      {step.label}
                    </Text>
                    {active && (
                      <Text style={[styles.stepActive, { color: colors.primary }]}>Current</Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={[styles.cancelCard, { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' }]}>
            <Ionicons name="close-circle-outline" size={28} color={colors.destructive} />
            <Text style={[styles.cancelText, { color: colors.destructive }]}>Order Cancelled</Text>
          </View>
        )}

        {/* Items */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 12 }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Items</Text>
          {order.items?.map((item, i) => {
            const product = typeof item.product === 'object' ? item.product : null;
            return (
              <View key={i} style={styles.orderItem}>
                <View style={styles.itemLeft}>
                  <View style={[styles.qtyBadge, { backgroundColor: colors.secondary }]}>
                    <Text style={[styles.qtyText, { color: colors.primary }]}>{item.quantity}</Text>
                  </View>
                  <Text style={[styles.itemName, { color: colors.foreground }]} numberOfLines={2}>
                    {product?.name ?? `Item ${i + 1}`}
                  </Text>
                </View>
                <Text style={[styles.itemPrice, { color: colors.foreground }]}>
                  ₹{(item.price * item.quantity).toFixed(0)}
                </Text>
              </View>
            );
          })}
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { color: colors.foreground }]}>Total</Text>
            <Text style={[styles.totalValue, { color: colors.primary }]}>₹{order.totalAmount?.toFixed(0)}</Text>
          </View>
        </View>

        {/* Track order live */}
        {order.status === 'out_for_delivery' && (
          <TouchableOpacity
            style={[styles.trackBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.push({ pathname: '/tracking/[id]', params: { id: order._id } })}
            activeOpacity={0.85}
          >
            <Ionicons name="navigate-outline" size={18} color="#fff" />
            <Text style={styles.trackBtnText}>Track Live Location</Text>
          </TouchableOpacity>
        )}

        {/* Delivery address */}
        {order.deliveryAddress && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 12 }]}>
            <View style={styles.addressHeader}>
              <Ionicons name="location-outline" size={18} color={colors.primary} />
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>Delivery Address</Text>
            </View>
            <Text style={[styles.addressText, { color: colors.mutedForeground }]}>
              {[order.deliveryAddress.street, order.deliveryAddress.city, order.deliveryAddress.state, order.deliveryAddress.pincode]
                .filter(Boolean).join(', ')}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  card: { borderRadius: 16, borderWidth: 1, padding: 16 },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  orderId: { fontSize: 13 },
  orderDate: { fontSize: 13, marginTop: 2 },
  divider: { height: 1, marginVertical: 12 },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  payText: { fontSize: 14 },
  stepRow: { flexDirection: 'row', gap: 12, marginBottom: 0 },
  stepLeft: { alignItems: 'center', width: 36 },
  stepDot: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  stepLine: { width: 2, flex: 1, minHeight: 20, marginVertical: 4 },
  stepContent: { flex: 1, paddingVertical: 8 },
  stepLabel: { fontSize: 14 },
  stepActive: { fontSize: 12, marginTop: 2, fontWeight: '600' },
  cancelCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, padding: 16, marginTop: 12 },
  cancelText: { fontSize: 16, fontWeight: '700' },
  orderItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  itemLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  qtyBadge: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  qtyText: { fontSize: 13, fontWeight: '700' },
  itemName: { fontSize: 14, flex: 1 },
  itemPrice: { fontSize: 14, fontWeight: '600' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: 16, fontWeight: '700' },
  totalValue: { fontSize: 18, fontWeight: '800' },
  addressHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  addressText: { fontSize: 14, lineHeight: 20 },
  trackBtn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', height: 50, borderRadius: 12, marginTop: 12 },
  trackBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
