import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

interface Address { name: string; phone: string; street: string; city: string; state: string; pincode: string; }

export default function CheckoutScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { items, shopId, total, clearCart } = useCart();
  const { user } = useAuth();

  const [address, setAddress] = useState<Address>({
    name: user?.name ?? '',
    phone: user?.phone ?? '',
    street: '',
    city: '',
    state: '',
    pincode: '',
  });
  const [loading, setLoading] = useState(false);
  const DELIVERY_FEE = 30;

  function updateField(field: keyof Address, value: string) {
    setAddress(prev => ({ ...prev, [field]: value }));
  }

  async function placeOrder() {
    const { name, phone, street, city, state, pincode } = address;
    if (!name || !phone || !street || !city || !state || !pincode) {
      Alert.alert('Incomplete address', 'Please fill in all delivery details.');
      return;
    }
    if (!shopId) { Alert.alert('Cart error', 'Cart is empty or shop not found.'); return; }

    try {
      setLoading(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

      const orderPayload = {
        shop: shopId,
        items: items.map(i => ({ product: i.product._id, quantity: i.quantity, price: i.product.price })),
        deliveryAddress: { street, city, state, pincode },
        paymentMethod: 'cod',
        totalAmount: total + DELIVERY_FEE,
        deliveryFee: DELIVERY_FEE,
        customerName: name,
        customerPhone: phone,
      };

      await api.post('/orders', orderPayload);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      clearCart();
      Alert.alert('Order Placed!', 'Your order has been placed successfully.', [
        { text: 'View Orders', onPress: () => router.replace('/(customer)/orders') },
      ]);
    } catch (e: unknown) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Order failed', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const topPad = Platform.OS === 'web' ? 20 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Checkout</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 140 + insets.bottom }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Delivery Address */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="location-outline" size={18} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Delivery Address</Text>
          </View>

          {[
            { label: 'Full Name', field: 'name' as const, placeholder: 'Recipient name', keyboard: 'default' },
            { label: 'Phone', field: 'phone' as const, placeholder: '10-digit mobile number', keyboard: 'phone-pad' },
            { label: 'Street / Flat No.', field: 'street' as const, placeholder: 'House no., street, area', keyboard: 'default' },
            { label: 'City', field: 'city' as const, placeholder: 'City', keyboard: 'default' },
            { label: 'State', field: 'state' as const, placeholder: 'State', keyboard: 'default' },
            { label: 'Pincode', field: 'pincode' as const, placeholder: '6-digit pincode', keyboard: 'number-pad' },
          ].map(f => (
            <View key={f.field} style={styles.fieldWrap}>
              <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>{f.label}</Text>
              <TextInput
                style={[styles.fieldInput, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
                placeholder={f.placeholder}
                placeholderTextColor={colors.mutedForeground}
                value={address[f.field]}
                onChangeText={v => updateField(f.field, v)}
                keyboardType={f.keyboard as 'default'}
              />
            </View>
          ))}
        </View>

        {/* Payment method */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 12 }]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="card-outline" size={18} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Payment Method</Text>
          </View>
          <View style={[styles.codRow, { borderColor: colors.primary, backgroundColor: colors.secondary }]}>
            <Ionicons name="cash-outline" size={22} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.codTitle, { color: colors.foreground }]}>Cash on Delivery</Text>
              <Text style={[styles.codSub, { color: colors.mutedForeground }]}>Pay when your order arrives</Text>
            </View>
            <Ionicons name="radio-button-on" size={20} color={colors.primary} />
          </View>
        </View>

        {/* Order summary */}
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 12 }]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="receipt-outline" size={18} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Order Summary</Text>
          </View>
          {items.map(i => (
            <View key={i.product._id} style={styles.summaryItem}>
              <Text style={[styles.itemName, { color: colors.foreground }]} numberOfLines={1}>
                {i.quantity}× {i.product.name}
              </Text>
              <Text style={[styles.itemPrice, { color: colors.foreground }]}>
                ₹{(i.product.price * i.quantity).toFixed(0)}
              </Text>
            </View>
          ))}
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Subtotal</Text>
            <Text style={[styles.summaryValue, { color: colors.foreground }]}>₹{total.toFixed(0)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Delivery fee</Text>
            <Text style={[styles.summaryValue, { color: colors.foreground }]}>₹{DELIVERY_FEE}</Text>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.summaryRow}>
            <Text style={[styles.totalLabel, { color: colors.foreground }]}>Total</Text>
            <Text style={[styles.totalValue, { color: colors.primary }]}>₹{(total + DELIVERY_FEE).toFixed(0)}</Text>
          </View>
        </View>
      </ScrollView>

      {/* Place Order */}
      <View style={[styles.footer, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          style={[styles.placeBtn, { backgroundColor: colors.primary }]}
          onPress={placeOrder}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? <ActivityIndicator color="#fff" /> : (
            <>
              <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
              <Text style={styles.placeBtnText}>Place Order · ₹{(total + DELIVERY_FEE).toFixed(0)}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  section: { borderRadius: 16, borderWidth: 1, padding: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  fieldWrap: { marginBottom: 12 },
  fieldLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  fieldInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  codRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderRadius: 12, padding: 14 },
  codTitle: { fontSize: 15, fontWeight: '600' },
  codSub: { fontSize: 12, marginTop: 1 },
  summaryItem: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  itemName: { fontSize: 14, flex: 1, marginRight: 8 },
  itemPrice: { fontSize: 14, fontWeight: '600' },
  divider: { height: 1, marginVertical: 10 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  summaryLabel: { fontSize: 14 },
  summaryValue: { fontSize: 14, fontWeight: '600' },
  totalLabel: { fontSize: 16, fontWeight: '700' },
  totalValue: { fontSize: 18, fontWeight: '800' },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, borderTopWidth: 1 },
  placeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 12 },
  placeBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
