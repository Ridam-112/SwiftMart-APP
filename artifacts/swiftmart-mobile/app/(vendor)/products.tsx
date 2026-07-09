import React from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator, Platform } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { api, extractList } from '@/lib/api';
import { Product } from '@/lib/types';

export default function VendorProductsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 20 : insets.top;

  const { data: products = [], isLoading, refetch, isRefetching } = useQuery<Product[]>({
    queryKey: ['vendor-products'],
    queryFn: async () => {
      const res = await api.get<unknown>('/vendor/products');
      return extractList<Product>(res, 'products');
    },
  });

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>My Products</Text>
        <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>{products.length} products</Text>
      </View>

      <FlatList
        data={products}
        keyExtractor={p => p._id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.list, { paddingBottom: 90 + insets.bottom }]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
        renderItem={({ item: p }) => (
          <View style={[styles.productRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {p.image ? (
              <Image source={{ uri: p.image }} style={styles.productImg} contentFit="cover" />
            ) : (
              <View style={[styles.productImgPlaceholder, { backgroundColor: colors.muted }]}>
                <Ionicons name="cube-outline" size={22} color={colors.mutedForeground} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[styles.productName, { color: colors.foreground }]} numberOfLines={2}>{p.name}</Text>
              <Text style={[styles.productPrice, { color: colors.primary }]}>₹{p.price}{p.unit ? ` / ${p.unit}` : ''}</Text>
              {p.category && (
                <Text style={[styles.productCat, { color: colors.mutedForeground }]}>{p.category}</Text>
              )}
            </View>
            <View style={[
              styles.availBadge,
              { backgroundColor: p.isAvailable !== false ? '#F0FDF4' : '#FEF2F2' },
            ]}>
              <View style={[styles.dot, { backgroundColor: p.isAvailable !== false ? '#22C55E' : '#EF4444' }]} />
              <Text style={[styles.availText, { color: p.isAvailable !== false ? '#15803D' : '#DC2626' }]}>
                {p.isAvailable !== false ? 'Active' : 'Off'}
              </Text>
            </View>
          </View>
        )}
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 60 }} />
          ) : (
            <View style={styles.empty}>
              <Ionicons name="cube-outline" size={56} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No products yet</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Add products from the vendor portal</Text>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: 1 },
  headerTitle: { fontSize: 22, fontWeight: '800' },
  headerSub: { fontSize: 13, marginTop: 2 },
  list: { padding: 16, gap: 10 },
  productRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, borderWidth: 1, padding: 12,
  },
  productImg: { width: 64, height: 64, borderRadius: 10 },
  productImgPlaceholder: { width: 64, height: 64, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  productName: { fontSize: 15, fontWeight: '600' },
  productPrice: { fontSize: 14, fontWeight: '700', marginTop: 2 },
  productCat: { fontSize: 12, marginTop: 2 },
  availBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  availText: { fontSize: 11, fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyTitle: { fontSize: 20, fontWeight: '700' },
  emptyText: { fontSize: 14 },
});
