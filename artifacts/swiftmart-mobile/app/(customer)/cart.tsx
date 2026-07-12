import React from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';

export default function CartScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { items, updateQuantity, removeItem, total, itemCount } = useCart();
  const { user } = useAuth();

  function handleCheckout() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Browsing and adding to cart don't require an account — only checking
    // out does, since it creates a real order tied to a customer.
    router.push(user ? '/checkout' : '/login');
  }

  const DELIVERY_FEE = items.length > 0 ? 30 : 0;
  const topPad = Platform.OS === 'web' ? 20 : insets.top;

  if (items.length === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: colors.background, paddingTop: topPad }]}>
        <View style={[styles.emptyIconWrap, { backgroundColor: colors.secondary }]}>
          <Ionicons name="bag-outline" size={56} color={colors.primary} />
        </View>
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Your cart is empty</Text>
        <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
          Add items from a shop to get started
        </Text>
        <TouchableOpacity
          style={[styles.shopBtn, { backgroundColor: colors.primary }]}
          onPress={() => router.replace('/(customer)/home')}
        >
          <Text style={styles.shopBtnText}>Browse Shops</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>My Cart</Text>
        <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
          {itemCount} item{itemCount !== 1 ? 's' : ''}
        </Text>
      </View>

      <FlatList
        data={items}
        keyExtractor={i => i.product._id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.list, { paddingBottom: 160 + insets.bottom }]}
        renderItem={({ item }) => (
          <View style={[styles.cartItem, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {item.product.image ? (
              <Image source={{ uri: item.product.image }} style={styles.productImage} contentFit="cover" />
            ) : (
              <View style={[styles.productImagePlaceholder, { backgroundColor: colors.muted }]}>
                <Ionicons name="image-outline" size={24} color={colors.mutedForeground} />
              </View>
            )}
            <View style={styles.productInfo}>
              <Text style={[styles.productName, { color: colors.foreground }]} numberOfLines={2}>
                {item.product.name}
              </Text>
              {item.product.unit && (
                <Text style={[styles.productUnit, { color: colors.mutedForeground }]}>{item.product.unit}</Text>
              )}
              <Text style={[styles.productPrice, { color: colors.primary }]}>
                ₹{(item.product.price * item.quantity).toFixed(0)}
              </Text>
            </View>
            <View style={styles.controls}>
              <TouchableOpacity
                style={[styles.stepBtn, { backgroundColor: colors.muted }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); removeItem(item.product._id); }}
              >
                <Ionicons name="trash-outline" size={14} color={colors.destructive} />
              </TouchableOpacity>
              <View style={[styles.stepper, { borderColor: colors.primary }]}>
                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); updateQuantity(item.product._id, item.quantity - 1); }}
                >
                  <Ionicons name="remove" size={16} color={colors.primary} />
                </TouchableOpacity>
                <Text style={[styles.qty, { color: colors.foreground }]}>{item.quantity}</Text>
                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); updateQuantity(item.product._id, item.quantity + 1); }}
                >
                  <Ionicons name="add" size={16} color={colors.primary} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      />

      {/* Summary + Checkout */}
      <View style={[styles.footer, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
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
        <TouchableOpacity
          style={[styles.checkoutBtn, { backgroundColor: colors.primary }]}
          onPress={handleCheckout}
          activeOpacity={0.85}
        >
          <Ionicons name="lock-closed-outline" size={18} color="#fff" />
          <Text style={styles.checkoutBtnText}>Proceed to Checkout</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  emptyIconWrap: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  emptyTitle: { fontSize: 20, fontWeight: '700' },
  emptyText: { fontSize: 14, textAlign: 'center' },
  shopBtn: { paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12, marginTop: 8 },
  shopBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  header: { paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  headerTitle: { fontSize: 22, fontWeight: '800' },
  headerSub: { fontSize: 13, marginTop: 2 },
  list: { padding: 16, gap: 10 },
  cartItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, borderWidth: 1, padding: 12,
  },
  productImage: { width: 72, height: 72, borderRadius: 10 },
  productImagePlaceholder: { width: 72, height: 72, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  productInfo: { flex: 1 },
  productName: { fontSize: 14, fontWeight: '600', lineHeight: 19 },
  productUnit: { fontSize: 12, marginTop: 2 },
  productPrice: { fontSize: 16, fontWeight: '700', marginTop: 4 },
  controls: { alignItems: 'center', gap: 8 },
  stepBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 8 },
  stepperBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  qty: { fontSize: 14, fontWeight: '700', minWidth: 22, textAlign: 'center' },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, borderTopWidth: 1, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.08, shadowRadius: 8 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  summaryLabel: { fontSize: 14 },
  summaryValue: { fontSize: 14, fontWeight: '600' },
  divider: { height: 1, marginVertical: 8 },
  totalLabel: { fontSize: 16, fontWeight: '700' },
  totalValue: { fontSize: 18, fontWeight: '800' },
  checkoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 12, marginTop: 10 },
  checkoutBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
