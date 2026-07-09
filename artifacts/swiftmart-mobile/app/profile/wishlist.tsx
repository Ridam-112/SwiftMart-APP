import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useWishlist } from '@/context/WishlistContext';
import { useCart } from '@/context/CartContext';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Product } from '@/lib/types';

export default function WishlistScreen() {
  const colors = useColors();
  const { items, remove } = useWishlist();
  const { addItem, getQuantity } = useCart();

  function handleAdd(product: Product) {
    const shopId = product.shopId ?? (typeof product.shop === 'string' ? product.shop : product.shop?._id) ?? '';
    if (!shopId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    addItem(product, shopId);
  }

  function handleRemove(id: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    remove(id);
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Wishlist" />
      {items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="heart-outline" size={64} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Your Wishlist is Empty</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Tap the heart icon on any product to save it here.
          </Text>
          <TouchableOpacity
            style={[styles.shopBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.push('/(customer)/home')}
            activeOpacity={0.85}
          >
            <Text style={styles.shopBtnText}>Browse Products</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={p => p._id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: product }) => {
            const imageUri = product.images?.[0] || product.image;
            const hasDiscount = product.discountedPrice != null && product.discountedPrice < product.price;
            const qty = getQuantity(product._id);

            return (
              <TouchableOpacity
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => router.push({ pathname: '/product/[id]', params: { id: product._id } })}
                activeOpacity={0.85}
              >
                {imageUri ? (
                  <Image source={{ uri: imageUri }} style={styles.image} contentFit="cover" transition={200} />
                ) : (
                  <View style={[styles.image, styles.imagePlaceholder, { backgroundColor: colors.muted }]}>
                    <Ionicons name="image-outline" size={24} color={colors.mutedForeground} />
                  </View>
                )}
                <View style={styles.info}>
                  <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={2}>{product.name}</Text>
                  {product.unit && <Text style={[styles.unit, { color: colors.mutedForeground }]}>{product.unit}</Text>}
                  <View style={styles.priceRow}>
                    <Text style={[styles.price, { color: colors.foreground }]}>
                      ₹{hasDiscount ? product.discountedPrice : product.price}
                    </Text>
                    {hasDiscount && (
                      <Text style={styles.originalPrice}>₹{product.price}</Text>
                    )}
                  </View>
                </View>
                <View style={styles.actions}>
                  <TouchableOpacity onPress={() => handleRemove(product._id)} style={styles.heartBtn}>
                    <Ionicons name="heart" size={20} color={colors.destructive} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.cartBtn, { backgroundColor: qty > 0 ? colors.secondary : colors.primary }]}
                    onPress={() => handleAdd(product)}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={qty > 0 ? 'checkmark' : 'cart-outline'}
                      size={16}
                      color={qty > 0 ? colors.primary : '#fff'}
                    />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  emptyTitle: { fontSize: 20, fontWeight: '700' },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  shopBtn: { paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12, marginTop: 8 },
  shopBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  list: { padding: 16, gap: 12, paddingBottom: 40 },
  card: { flexDirection: 'row', borderRadius: 16, borderWidth: 1, overflow: 'hidden', alignItems: 'center' },
  image: { width: 90, height: 90 },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, padding: 12, gap: 3 },
  name: { fontSize: 14, fontWeight: '600', lineHeight: 19 },
  unit: { fontSize: 12 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  price: { fontSize: 15, fontWeight: '800' },
  originalPrice: { fontSize: 12, color: '#9CA3AF', textDecorationLine: 'line-through' },
  actions: { flexDirection: 'column', alignItems: 'center', gap: 8, paddingRight: 12 },
  heartBtn: { padding: 4 },
  cartBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
});
