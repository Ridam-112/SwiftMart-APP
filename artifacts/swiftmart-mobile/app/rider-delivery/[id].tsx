import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Platform, TextInput, Alert, Linking,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { api } from '@/lib/api';
import { Order, User } from '@/lib/types';

export default function RiderActiveDeliveryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const topPad = Platform.OS === 'web' ? 20 : insets.top;
  const [otp, setOtp] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'active' | 'denied'>('idle');
  const watchRef = useRef<Location.LocationSubscription | null>(null);

  const { data: order, isLoading, refetch } = useQuery<Order>({
    queryKey: ['order', id],
    queryFn: async () => {
      const res = await api.get<Record<string, unknown>>(`/orders/${id}`);
      return (res.order ?? res) as Order;
    },
    enabled: !!id,
    refetchInterval: 15000,
  });

  const isActive = order?.status === 'out_for_delivery';

  // Push GPS location every ~10s while this delivery is actively out for delivery.
  // Foreground-only tracking: keeps the screen simple and avoids background
  // location permission complexity that Expo Go can't reliably support.
  useEffect(() => {
    let cancelled = false;
    async function start() {
      if (!isActive) return;
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationStatus('denied');
        return;
      }
      setLocationStatus('active');
      watchRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 10000, distanceInterval: 20 },
        async (pos) => {
          if (cancelled) return;
          try {
            await api.patch('/delivery/me/location', {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            });
          } catch {
            // Best-effort: a missed ping isn't fatal, next tick will retry.
          }
        },
      );
    }
    start();
    return () => {
      cancelled = true;
      watchRef.current?.remove();
      watchRef.current = null;
    };
  }, [isActive, id]);

  async function startDelivery() {
    try {
      await api.patch(`/vendor/orders/${id}/status`, { status: 'out_for_delivery' }).catch(() =>
        api.patch(`/delivery/orders/${id}/status`, { status: 'out_for_delivery' }),
      );
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      refetch();
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not start delivery.');
    }
  }

  async function markDelivered() {
    if (otp.trim().length < 4) {
      Alert.alert('Enter OTP', 'Ask the customer for their delivery OTP.');
      return;
    }
    try {
      setSubmitting(true);
      await api.patch(`/orders/${id}/status`, { status: 'delivered', deliveryOtp: otp.trim() });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ['rider-deliveries'] });
      qc.invalidateQueries({ queryKey: ['rider-stats'] });
      Alert.alert('Delivered!', 'Order marked as delivered.', [
        { text: 'OK', onPress: () => router.replace('/(rider)/deliveries') },
      ]);
    } catch (e: unknown) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Invalid OTP', e instanceof Error ? e.message : 'Could not verify OTP.');
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading || !order) {
    return (
      <View style={[styles.loader, { paddingTop: topPad, backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const customer = typeof order.customer === 'object' ? (order.customer as User) : null;
  const shopName = typeof order.shop === 'object' ? order.shop.name : 'Shop';
  const addr = order.deliveryAddress;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Active Delivery</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.body}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>{shopName}</Text>
          <Text style={[styles.meta, { color: colors.mutedForeground }]}>
            Order #{order._id.slice(-6).toUpperCase()} · {order.items?.length ?? 0} items · ₹{order.totalAmount?.toFixed(0)}
          </Text>
        </View>

        {customer && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 12 }]}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Customer</Text>
            <Text style={[styles.meta, { color: colors.foreground }]}>{customer.name}</Text>
            {customer.phone && (
              <TouchableOpacity style={styles.callRow} onPress={() => Linking.openURL(`tel:${customer.phone}`)}>
                <Ionicons name="call-outline" size={14} color={colors.primary} />
                <Text style={[styles.callText, { color: colors.primary }]}>{customer.phone}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {addr && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 12 }]}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Delivery Address</Text>
            <Text style={[styles.meta, { color: colors.mutedForeground }]}>
              {[addr.street, addr.city, addr.state, addr.pincode].filter(Boolean).join(', ')}
            </Text>
          </View>
        )}

        {isActive && (
          <View style={[styles.gpsRow, { backgroundColor: colors.secondary }]}>
            <Ionicons
              name={locationStatus === 'active' ? 'navigate-circle' : 'navigate-circle-outline'}
              size={16}
              color={colors.primary}
            />
            <Text style={[styles.gpsText, { color: colors.primary }]}>
              {locationStatus === 'active'
                ? 'Sharing your location with the customer'
                : locationStatus === 'denied'
                  ? 'Location permission denied — enable it to share live GPS'
                  : 'Starting location sharing…'}
            </Text>
          </View>
        )}

        {!isActive ? (
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.accent }]} onPress={startDelivery} activeOpacity={0.85}>
            <Ionicons name="bicycle-outline" size={18} color="#fff" />
            <Text style={styles.primaryBtnText}>Start Delivery</Text>
          </TouchableOpacity>
        ) : (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 12 }]}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>Complete Delivery</Text>
            <Text style={[styles.meta, { color: colors.mutedForeground, marginBottom: 10 }]}>
              Ask the customer for their delivery OTP
            </Text>
            <TextInput
              style={[styles.otpInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.input }]}
              placeholder="Enter OTP"
              placeholderTextColor={colors.mutedForeground}
              value={otp}
              onChangeText={t => setOtp(t.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
            />
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
              onPress={markDelivered}
              disabled={submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-done-outline" size={18} color="#fff" />
                  <Text style={styles.primaryBtnText}>Mark Delivered</Text>
                </>
              )}
            </TouchableOpacity>
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
  cardTitle: { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  meta: { fontSize: 14 },
  callRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  callText: { fontSize: 14, fontWeight: '600' },
  gpsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, padding: 12, marginTop: 12 },
  gpsText: { fontSize: 12, fontWeight: '600', flex: 1 },
  primaryBtn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', height: 52, borderRadius: 12, marginTop: 16 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  otpInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, fontSize: 20, letterSpacing: 4, textAlign: 'center' },
});
