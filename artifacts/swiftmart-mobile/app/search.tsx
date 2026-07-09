import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, ActivityIndicator, Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useCart } from '@/context/CartContext';
import { ShopCard } from '@/components/ShopCard';
import { ProductCard } from '@/components/ProductCard';
import { api, extractList, normalizeShop } from '@/lib/api';
import { Shop, Product } from '@/lib/types';

export default function SearchScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { addItem, updateQuantity, getQuantity } = useCart();
  const [query, setQuery] = useState('');
  const topPad = Platform.OS === 'web' ? 20 : insets.top;

  const { data: shops = [], isLoading: shopsLoading } = useQuery<Shop[]>({
    queryKey: ['shops'],
    queryFn: async () => {
      const res = await api.get<unknown>('/shops');
      return extractList<Shop>(res, 'shops').map(normalizeShop<Shop>);
    },
  });

  const { data: products = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: async () => {
      const res = await api.get<unknown>('/products');
      return extractList<Product>(res, 'products');
    },
  });

  const isLoading = shopsLoading || productsLoading;
  const q = query.trim().toLowerCase();

  const filteredShops = useMemo(
    () => (q ? shops.filter(s => s.name?.toLowerCase().includes(q) || s.category?.toLowerCase().includes(q)) : []),
    [shops, q],
  );
  const filteredProducts = useMemo(
    () => (q ? products.filter(p => p.name?.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q)) : []),
    [products, q],
  );

  const hasResults = filteredShops.length > 0 || filteredProducts.length > 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: topPad }]}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={[styles.searchBar, { backgroundColor: colors.input, borderColor: colors.border }]}>
          <Ionicons name="search" size={18} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Search products & shops"
            placeholderTextColor={colors.mutedForeground}
            value={query}
            onChangeText={setQuery}
            autoFocus
            autoCapitalize="none"
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {q.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="search-outline" size={56} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Search SwiftMart</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Find products and shops near you
          </Text>
        </View>
      ) : isLoading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
      ) : !hasResults ? (
        <View style={styles.empty}>
          <Ionicons name="sad-outline" size={56} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No results</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Try a different search term
          </Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 40 + insets.bottom }}>
          {filteredShops.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Shops</Text>
              {filteredShops.map(shop => (
                <ShopCard
                  key={shop._id}
                  shop={shop}
                  onPress={() => router.push({ pathname: '/shop/[id]', params: { id: shop._id } })}
                />
              ))}
            </View>
          )}
          {filteredProducts.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Products</Text>
              <View style={styles.productGrid}>
                {filteredProducts.map(p => {
                  const sid = (typeof p.shop === 'object' ? p.shop._id : p.shop) ?? p.shopId ?? '';
                  return (
                    <View key={p._id} style={styles.productCol}>
                      <TouchableOpacity
                        activeOpacity={0.9}
                        onPress={() => router.push({ pathname: '/product/[id]', params: { id: p._id } })}
                      >
                        <ProductCard
                          product={p}
                          quantity={getQuantity(p._id)}
                          onAdd={() => addItem(p, sid)}
                          onRemove={() => {
                            const qty = getQuantity(p._id);
                            updateQuantity(p._id, qty - 1);
                          }}
                        />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 12 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 44 },
  searchInput: { flex: 1, fontSize: 15 },
  empty: { alignItems: 'center', paddingTop: 100, gap: 10, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyText: { fontSize: 14, textAlign: 'center' },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 10 },
  productGrid: { flexDirection: 'row', flexWrap: 'wrap', margin: -4 },
  productCol: { width: '50%', padding: 4 },
});
