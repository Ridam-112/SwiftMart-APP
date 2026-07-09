import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Platform, ScrollView,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useCart } from '@/context/CartContext';
import { ProductCard } from '@/components/ProductCard';
import { api, extractList, normalizeShop } from '@/lib/api';
import { Shop, Product } from '@/lib/types';

export default function ShopDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addItem, updateQuantity, getQuantity, itemCount, total, shopId } = useCart();

  const { data: shop, isLoading: shopLoading } = useQuery<Shop>({
    queryKey: ['shop', id],
    queryFn: async () => {
      const res = await api.get<Record<string, unknown>>(`/shops/${id}`);
      // API wraps response: { success, shop: {...} }
      const raw = (res.shop ?? res) as Record<string, unknown>;
      return normalizeShop<Shop>(raw);
    },
    enabled: !!id,
  });

  const { data: products = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ['shop-products', id],
    queryFn: async () => {
      // /shops/:id/products is not a valid endpoint — use /products?shopId=:id
      const res = await api.get<unknown>(`/products?shopId=${id}`);
      return extractList<Product>(res, 'products');
    },
    enabled: !!id,
  });

  const isLoading = shopLoading || productsLoading;
  const topPad = Platform.OS === 'web' ? 20 : insets.top;

  // Group products by category
  const categories = [...new Set(products.map(p => p.category ?? 'Other'))];
  const grouped = categories.map(cat => ({
    category: cat,
    products: products.filter(p => (p.category ?? 'Other') === cat),
  }));

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Back button */}
      <TouchableOpacity
        style={[styles.backBtn, { top: topPad + 8, backgroundColor: 'rgba(0,0,0,0.4)' }]}
        onPress={() => router.back()}
      >
        <Ionicons name="arrow-back" size={22} color="#fff" />
      </TouchableOpacity>

      {isLoading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={grouped}
          keyExtractor={g => g.category}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              {/* Cover image */}
              {shop?.image || shop?.coverImage ? (
                <Image
                  source={{ uri: shop.image || shop.coverImage }}
                  style={styles.coverImage}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.coverPlaceholder, { backgroundColor: colors.secondary }]}>
                  <Ionicons name="storefront-outline" size={60} color={colors.primary} />
                </View>
              )}

              {/* Shop info */}
              <View style={[styles.shopInfo, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
                <View style={styles.shopNameRow}>
                  <Text style={[styles.shopName, { color: colors.foreground }]}>{shop?.name}</Text>
                  {shop?.rating != null && (
                    <View style={[styles.ratingBadge, { backgroundColor: colors.secondary }]}>
                      <Ionicons name="star" size={12} color={colors.primary} />
                      <Text style={[styles.ratingText, { color: colors.primary }]}>{shop.rating.toFixed(1)}</Text>
                    </View>
                  )}
                </View>
                {shop?.description && (
                  <Text style={[styles.shopDesc, { color: colors.mutedForeground }]}>{shop.description}</Text>
                )}
                <View style={styles.shopMeta}>
                  {shop?.deliveryTime && (
                    <View style={styles.metaItem}>
                      <Ionicons name="time-outline" size={13} color={colors.mutedForeground} />
                      <Text style={[styles.metaText, { color: colors.mutedForeground }]}>{shop.deliveryTime}</Text>
                    </View>
                  )}
                  {shop?.deliveryFee != null && (
                    <View style={styles.metaItem}>
                      <Ionicons name="bicycle-outline" size={13} color={colors.mutedForeground} />
                      <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                        {shop.deliveryFee === 0 ? 'Free delivery' : `₹${shop.deliveryFee} delivery`}
                      </Text>
                    </View>
                  )}
                  {shop?.minOrder != null && (
                    <View style={styles.metaItem}>
                      <Ionicons name="bag-outline" size={13} color={colors.mutedForeground} />
                      <Text style={[styles.metaText, { color: colors.mutedForeground }]}>Min ₹{shop.minOrder}</Text>
                    </View>
                  )}
                </View>
              </View>
            </>
          }
          renderItem={({ item: g }) => (
            <View style={styles.section}>
              <Text style={[styles.catTitle, { color: colors.foreground }]}>{g.category}</Text>
              <View style={styles.productGrid}>
                {g.products.map(p => (
                  <View key={p._id} style={styles.productCol}>
                    <ProductCard
                      product={p}
                      quantity={getQuantity(p._id)}
                      onPress={() => router.push({ pathname: '/product/[id]', params: { id: p._id } })}
                      onAdd={() => addItem(p, id!)}
                      onRemove={() => {
                        const qty = getQuantity(p._id);
                        updateQuantity(p._id, qty - 1);
                      }}
                    />
                  </View>
                ))}
              </View>
            </View>
          )}
          contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}
          ListEmptyComponent={
            !isLoading ? (
              <View style={styles.empty}>
                <Ionicons name="cube-outline" size={48} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No products available</Text>
              </View>
            ) : null
          }
        />
      )}

      {/* Cart FAB */}
      {itemCount > 0 && shopId === id && (
        <TouchableOpacity
          style={[styles.cartFab, { backgroundColor: colors.primary, bottom: insets.bottom + 20 }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push('/(customer)/cart'); }}
          activeOpacity={0.9}
        >
          <View style={[styles.cartBadge, { backgroundColor: '#fff' }]}>
            <Text style={[styles.cartBadgeText, { color: colors.primary }]}>{itemCount}</Text>
          </View>
          <Text style={styles.cartFabText}>View Cart</Text>
          <Text style={styles.cartFabPrice}>₹{total.toFixed(0)}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  backBtn: { position: 'absolute', left: 16, zIndex: 10, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  coverImage: { width: '100%', height: 200 },
  coverPlaceholder: { width: '100%', height: 200, alignItems: 'center', justifyContent: 'center' },
  shopInfo: { padding: 16, borderBottomWidth: 1 },
  shopNameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  shopName: { fontSize: 22, fontWeight: '800', flex: 1 },
  ratingBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  ratingText: { fontSize: 13, fontWeight: '700' },
  shopDesc: { fontSize: 13, marginTop: 4, lineHeight: 18 },
  shopMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 13 },
  section: { paddingHorizontal: 12, paddingTop: 16 },
  catTitle: { fontSize: 17, fontWeight: '700', marginBottom: 8, paddingHorizontal: 4 },
  productGrid: { flexDirection: 'row', flexWrap: 'wrap', margin: -4 },
  productCol: { width: '50%', padding: 4 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyText: { fontSize: 15 },
  cartFab: {
    position: 'absolute', left: 20, right: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderRadius: 16,
    elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8,
  },
  cartBadge: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  cartBadgeText: { fontSize: 12, fontWeight: '700' },
  cartFabText: { color: '#fff', fontSize: 15, fontWeight: '700', flex: 1, textAlign: 'center' },
  cartFabPrice: { color: 'rgba(255,255,255,0.9)', fontSize: 14, fontWeight: '600' },
});
