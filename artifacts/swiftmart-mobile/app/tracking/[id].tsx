import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Platform, Animated, Linking,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { api } from '@/lib/api';
import { Order, RiderLocation, User } from '@/lib/types';

const ORDER_STEPS = ['confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered'];

export default function OrderTrackingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 20 : insets.top;
  const bounce = useRef(new Animated.Value(0)).current;

  const { data: order, isLoading } = useQuery<Order>({
    queryKey: ['order', id],
    queryFn: async () => {
      const res = await api.get<Record<string, unknown>>(`/orders/${id}`);
      return (res.order ?? res) as Order;
    },
    enabled: !!id,
    refetchInterval: 15000,
  });

  const isOutForDelivery = order?.status === 'out_for_delivery';

  const { data: riderLocation } = useQuery<RiderLocation | null>({
    queryKey: ['rider-location', id],
    queryFn: async () => {
      try {
        return await api.get<RiderLocation>(`/orders/${id}/rider-location`);
      } catch {
        return null;
      }
    },
    enabled: !!id && isOutForDelivery,
    refetchInterval: 10000,
  });

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, { toValue: -8, duration: 500, useNativeDriver: true }),
        Animated.timing(bounce, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
    );
    if (isOutForDelivery) loop.start();
    return () => loop.stop();
  }, [isOutForDelivery, bounce]);

  if (isLoading || !order) {
    return (
      <View style={[styles.loader, { paddingTop: topPad, backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const stepIndex = ORDER_STEPS.indexOf(order.status);
  const progress = stepIndex < 0 ? 0 : (stepIndex + 1) / ORDER_STEPS.length;
  const rider = typeof order.rider === 'object' ? (order.rider as User) : null;
  const shopName = typeof order.shop === 'object' ? order.shop.name : 'Shop';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Track Order</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.body}>
        {/* Live status */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.statusRow}>
            <Animated.View style={[styles.bikeWrap, { backgroundColor: colors.secondary, transform: [{ translateY: bounce }] }]}>
              <Ionicons name="bicycle" size={28} color={colors.primary} />
            </Animated.View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.statusTitle, { color: colors.foreground }]}>
                {order.status === 'delivered' ? 'Delivered' : order.status === 'out_for_delivery' ? 'On the way' : 'Preparing your order'}
              </Text>
              <Text style={[styles.statusSub, { color: colors.mutedForeground }]}>from {shopName}</Text>
            </View>
          </View>

          {/* Progress bar */}
          <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
            <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${progress * 100}%` }]} />
          </View>
          <Text style={[styles.progressLabel, { color: colors.mutedForeground }]}>
            {order.status === 'delivered' ? 'Order delivered' : `Step ${Math.max(stepIndex + 1, 1)} of ${ORDER_STEPS.length}`}
          </Text>
        </View>

        {/* Rider info */}
        {isOutForDelivery && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 12 }]}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Delivery Partner</Text>
            {rider ? (
              <View style={styles.riderRow}>
                <View style={[styles.riderAvatar, { backgroundColor: colors.secondary }]}>
                  <Ionicons name="person" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.riderName, { color: colors.foreground }]}>{rider.name}</Text>
                  {rider.phone && (
                    <Text style={[styles.riderPhone, { color: colors.mutedForeground }]}>{rider.phone}</Text>
                  )}
                </View>
                {rider.phone && (
                  <TouchableOpacity
                    style={[styles.callBtn, { backgroundColor: colors.primary }]}
                    onPress={() => Linking.openURL(`tel:${rider.phone}`)}
                  >
                    <Ionicons name="call" size={18} color="#fff" />
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <Text style={[styles.riderPhone, { color: colors.mutedForeground }]}>Assigning a rider…</Text>
            )}

            {riderLocation ? (
              <View style={[styles.locBox, { backgroundColor: colors.secondary }]}>
                <Ionicons name="navigate-outline" size={14} color={colors.primary} />
                <Text style={[styles.locText, { color: colors.primary }]}>
                  Last seen {riderLocation.lat.toFixed(4)}, {riderLocation.lng.toFixed(4)}
                  {riderLocation.updatedAt ? ` · ${new Date(riderLocation.updatedAt).toLocaleTimeString()}` : ''}
                </Text>
              </View>
            ) : (
              <Text style={[styles.locWaiting, { color: colors.mutedForeground }]}>Waiting for live location…</Text>
            )}
          </View>
        )}

        {/* Delivery OTP */}
        {isOutForDelivery && order.deliveryOtp && (
          <View style={[styles.otpCard, { backgroundColor: colors.secondary, borderColor: colors.primary }]}>
            <Text style={[styles.otpLabel, { color: colors.foreground }]}>Share this OTP with your rider</Text>
            <Text style={[styles.otpValue, { color: colors.primary }]}>{order.deliveryOtp}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  body: { padding: 16 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16 },
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 10 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  bikeWrap: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  statusTitle: { fontSize: 17, fontWeight: '800' },
  statusSub: { fontSize: 13, marginTop: 2 },
  progressTrack: { height: 8, borderRadius: 4, marginTop: 18, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4 },
  progressLabel: { fontSize: 12, marginTop: 8 },
  riderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  riderAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  riderName: { fontSize: 15, fontWeight: '700' },
  riderPhone: { fontSize: 13, marginTop: 1 },
  callBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  locBox: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, padding: 10, marginTop: 12 },
  locText: { fontSize: 12, fontWeight: '600', flex: 1 },
  locWaiting: { fontSize: 12, marginTop: 12, fontStyle: 'italic' },
  otpCard: { borderRadius: 16, borderWidth: 1.5, padding: 18, alignItems: 'center', marginTop: 12 },
  otpLabel: { fontSize: 13, fontWeight: '600' },
  otpValue: { fontSize: 32, fontWeight: '800', letterSpacing: 6, marginTop: 6 },
});
