import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Platform, Dimensions,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useCart } from '@/context/CartContext';
import { useWishlist } from '@/context/WishlistContext';
import { api } from '@/lib/api';
import { Product, Shop } from '@/lib/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addItem, updateQuantity, getQuantity, itemCount, total, shopId } = useCart();
  const { isWished, toggle: toggleWishlist } = useWishlist();
  const [activeImage, setActiveImage] = useState(0);
  const [selectedWeight, setSelectedWeight] = useState<string | null>(null);

  const topPad = Platform.OS === 'web' ? 20 : insets.top;

  const { data: product, isLoading } = useQuery<Product>({
    queryKey: ['product', id],
    queryFn: async () => {
      const res = await api.get<Record<string, unknown>>(`/products/${id}`);
      // API wraps single product: { success, product: {...} }
      const raw = (res as Record<string, unknown>).product ?? res;
      return raw as Product;
    },
    enabled: !!id,
  });

  const shopIdForProduct =
    (typeof product?.shop === 'object' ? (product.shop as Shop)._id : product?.shop) ??
    product?.shopId ??
    '';
  // API may return shop as an object, a bare ID string, or just a flat shopName
  const shopObj = typeof product?.shop === 'object' ? (product.shop as Shop) : null;
  const shopDisplayName = shopObj?.name ?? (product as unknown as { shopName?: string })?.shopName ?? null;

  const images = product?.images?.length
    ? product.images
    : product?.image
      ? [product.image]
      : [];

  const activePrice = product
    ? product.weights?.find(w => w.value === selectedWeight)?.price ?? product.discountedPrice ?? product.price
    : 0;

  const available = product
    ? product.isAvailable !== false && (product.stock == null || product.stock > 0)
    : false;

  // When a weight/variant is selected, treat it as a distinct cart line so its
  // price is preserved independently of the base product's price.
  const selectedOption = product?.weights?.find(w => w.value === selectedWeight);
  const cartProduct: Product | null = product
    ? selectedOption
      ? {
          ...product,
          _id: `${product._id}::${selectedOption.value}`,
          name: `${product.name} (${selectedOption.label})`,
          price: selectedOption.price,
          discountedPrice: undefined,
        }
      : product
    : null;

  const quantity = cartProduct ? getQuantity(cartProduct._id) : 0;

  function handleAdd() {
    if (!cartProduct || !shopIdForProduct) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    addItem(cartProduct, shopIdForProduct);
  }

  function handleRemove() {
    if (!cartProduct) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const qty = getQuantity(cartProduct._id);
    updateQuantity(cartProduct._id, qty - 1);
  }

  if (isLoading || !product) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <TouchableOpacity
          style={[styles.backBtn, { top: topPad + 8, backgroundColor: 'rgba(0,0,0,0.4)' }]}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <TouchableOpacity
        style={[styles.backBtn, { top: topPad + 8, backgroundColor: 'rgba(0,0,0,0.4)' }]}
        onPress={() => router.back()}
      >
        <Ionicons name="arrow-back" size={22} color="#fff" />
      </TouchableOpacity>
      {product && (
        <TouchableOpacity
          style={[styles.wishBtn, { top: topPad + 8, backgroundColor: 'rgba(0,0,0,0.4)' }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); toggleWishlist(product); }}
        >
          <Ionicons name={isWished(product._id) ? 'heart' : 'heart-outline'} size={22} color={isWished(product._id) ? '#F87171' : '#fff'} />
        </TouchableOpacity>
      )}

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 140 + insets.bottom }}>
        {/* Image gallery */}
        {images.length > 0 ? (
          <>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={e =>
                setActiveImage(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH))
              }
            >
              {images.map((uri, i) => (
                <Image key={i} source={{ uri }} style={styles.galleryImage} contentFit="cover" />
              ))}
            </ScrollView>
            {images.length > 1 && (
              <View style={styles.dots}>
                {images.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.dot,
                      { backgroundColor: i === activeImage ? '#fff' : 'rgba(255,255,255,0.5)' },
                    ]}
                  />
                ))}
              </View>
            )}
          </>
        ) : (
          <View style={[styles.galleryPlaceholder, { backgroundColor: colors.secondary }]}>
            <Ionicons name="image-outline" size={60} color={colors.primary} />
          </View>
        )}

        <View style={styles.body}>
          {product.category && (
            <Text style={[styles.category, { color: colors.mutedForeground }]}>{product.category}</Text>
          )}
          <Text style={[styles.name, { color: colors.foreground }]}>{product.name}</Text>

          {(shopObj || shopDisplayName) && (
            <TouchableOpacity
              style={styles.shopLink}
              onPress={() => shopIdForProduct && router.push({ pathname: '/shop/[id]', params: { id: shopIdForProduct } })}
            >
              <Ionicons name="storefront-outline" size={14} color={colors.primary} />
              <Text style={[styles.shopLinkText, { color: colors.primary }]}>{shopDisplayName ?? shopObj?.name}</Text>
            </TouchableOpacity>
          )}

          <View style={styles.priceRow}>
            <Text style={[styles.price, { color: colors.foreground }]}>₹{activePrice}</Text>
            {product.discountedPrice != null && product.discountedPrice < product.price && (
              <Text style={[styles.originalPrice, { color: colors.mutedForeground }]}>₹{product.price}</Text>
            )}
            {product.unit && <Text style={[styles.unit, { color: colors.mutedForeground }]}>/ {product.unit}</Text>}
          </View>

          <View style={[styles.stockBadge, { backgroundColor: available ? '#F0FDF4' : '#FEF2F2' }]}>
            <View style={[styles.stockDot, { backgroundColor: available ? '#22C55E' : '#EF4444' }]} />
            <Text style={[styles.stockText, { color: available ? '#15803D' : '#DC2626' }]}>
              {available ? 'In stock' : 'Out of stock'}
            </Text>
          </View>

          {/* Weight / variant selector */}
          {product.weights && product.weights.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Select option</Text>
              <View style={styles.weightRow}>
                {product.weights.map(w => (
                  <TouchableOpacity
                    key={w.value}
                    style={[
                      styles.weightChip,
                      {
                        borderColor: selectedWeight === w.value ? colors.primary : colors.border,
                        backgroundColor: selectedWeight === w.value ? colors.secondary : colors.card,
                      },
                    ]}
                    onPress={() => setSelectedWeight(w.value)}
                  >
                    <Text
                      style={[
                        styles.weightLabel,
                        { color: selectedWeight === w.value ? colors.primary : colors.foreground },
                      ]}
                    >
                      {w.label}
                    </Text>
                    <Text
                      style={[
                        styles.weightPrice,
                        { color: selectedWeight === w.value ? colors.primary : colors.mutedForeground },
                      ]}
                    >
                      ₹{w.price}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {product.description && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Description</Text>
              <Text style={[styles.description, { color: colors.mutedForeground }]}>{product.description}</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Bottom add-to-cart bar */}
      <View style={[styles.bottomBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: insets.bottom + 12 }]}>
        {available ? (
          quantity === 0 ? (
            <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.primary }]} onPress={handleAdd} activeOpacity={0.85}>
              <Ionicons name="cart-outline" size={18} color={colors.primaryForeground} />
              <Text style={[styles.addBtnText, { color: colors.primaryForeground }]}>Add to Cart</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.stepperRow}>
              <View style={[styles.stepper, { borderColor: colors.primary }]}>
                <TouchableOpacity onPress={handleRemove} style={styles.stepBtn}>
                  <Ionicons name="remove" size={20} color={colors.primary} />
                </TouchableOpacity>
                <Text style={[styles.qty, { color: colors.primary }]}>{quantity}</Text>
                <TouchableOpacity onPress={handleAdd} style={styles.stepBtn}>
                  <Ionicons name="add" size={20} color={colors.primary} />
                </TouchableOpacity>
              </View>
              {itemCount > 0 && shopId === shopIdForProduct && (
                <TouchableOpacity
                  style={[styles.viewCartBtn, { backgroundColor: colors.primary }]}
                  onPress={() => router.push('/(customer)/cart')}
                >
                  <Text style={styles.viewCartText}>View Cart · ₹{total.toFixed(0)}</Text>
                </TouchableOpacity>
              )}
            </View>
          )
        ) : (
          <View style={[styles.addBtn, { backgroundColor: colors.muted }]}>
            <Text style={[styles.addBtnText, { color: colors.mutedForeground }]}>Out of Stock</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  backBtn: { position: 'absolute', left: 16, zIndex: 10, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  wishBtn: { position: 'absolute', right: 16, zIndex: 10, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  galleryImage: { width: SCREEN_WIDTH, height: 320 },
  galleryPlaceholder: { width: '100%', height: 320, alignItems: 'center', justifyContent: 'center' },
  dots: { position: 'absolute', bottom: 12, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  body: { padding: 20 },
  category: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  name: { fontSize: 22, fontWeight: '800', marginTop: 4 },
  shopLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  shopLinkText: { fontSize: 13, fontWeight: '600' },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 14 },
  price: { fontSize: 26, fontWeight: '800' },
  originalPrice: { fontSize: 16, textDecorationLine: 'line-through' },
  unit: { fontSize: 14 },
  stockBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, marginTop: 12 },
  stockDot: { width: 7, height: 7, borderRadius: 3.5 },
  stockText: { fontSize: 12, fontWeight: '700' },
  section: { marginTop: 22 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 10 },
  weightRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  weightChip: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center' },
  weightLabel: { fontSize: 13, fontWeight: '700' },
  weightPrice: { fontSize: 12, marginTop: 2 },
  description: { fontSize: 14, lineHeight: 21 },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: 1, padding: 16 },
  addBtn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', height: 52, borderRadius: 12 },
  addBtnText: { fontSize: 16, fontWeight: '700' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 12, overflow: 'hidden' },
  stepBtn: { paddingHorizontal: 16, paddingVertical: 12 },
  qty: { fontSize: 16, fontWeight: '700', minWidth: 24, textAlign: 'center' },
  viewCartBtn: { flex: 1, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  viewCartText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
