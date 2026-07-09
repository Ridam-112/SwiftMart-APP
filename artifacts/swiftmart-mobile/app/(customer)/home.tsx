import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  RefreshControl, ActivityIndicator, Platform, ScrollView,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useCart } from '@/context/CartContext';
import { api, extractList, DB_BASE_URL } from '@/lib/api';
import { Product, Category, HeroBanner } from '@/lib/types';

const FALLBACK_BANNER_IMAGE =
  'https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=600&q=80';

async function fetchHeroBanners(): Promise<HeroBanner[]> {
  const res = await fetch(`${DB_BASE_URL}/hero-banners`);
  if (!res.ok) throw new Error('Failed to load banners');
  const json = await res.json();
  return (json.banners ?? []) as HeroBanner[];
}

function ProductGridCard({ product }: { product: Product }) {
  const colors = useColors();
  const { addItem, updateQuantity, getQuantity } = useCart();

  const image = product.image || product.images?.[0];
  const hasDiscount = product.discountedPrice != null && product.discountedPrice < product.price;
  const discountPct = hasDiscount
    ? Math.round(((product.price - (product.discountedPrice as number)) / product.price) * 100)
    : 0;
  const isNew =
    !!product.createdAt && Date.now() - new Date(product.createdAt).getTime() < 7 * 24 * 60 * 60 * 1000;
  const quantity = getQuantity(product._id);
  const shopId = product.shopId || (typeof product.shop === 'string' ? product.shop : product.shop?._id) || '';

  return (
    <TouchableOpacity
      style={[styles.pCard, { backgroundColor: colors.card }]}
      activeOpacity={0.85}
      onPress={() => router.push({ pathname: '/product/[id]', params: { id: product._id } })}
    >
      <View style={styles.pImageWrap}>
        {image ? (
          <Image source={{ uri: image }} style={styles.pImage} contentFit="cover" transition={200} />
        ) : (
          <View style={[styles.pImage, styles.pImagePlaceholder, { backgroundColor: colors.muted }]}>
            <Ionicons name="image-outline" size={28} color={colors.mutedForeground} />
          </View>
        )}
        {hasDiscount && (
          <View style={styles.discountBadge}>
            <Text style={styles.discountBadgeText}>{discountPct}% off</Text>
          </View>
        )}
        {isNew && (
          <View style={styles.newBadge}>
            <Text style={styles.newBadgeText}>NEW</Text>
          </View>
        )}
      </View>
      <View style={styles.pInfo}>
        <Text style={[styles.pName, { color: colors.foreground }]} numberOfLines={1}>
          {product.name}
        </Text>
        {product.unit && (
          <Text style={[styles.pUnit, { color: colors.mutedForeground }]}>{product.unit}</Text>
        )}
        <View style={styles.pBottom}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.pPrice, { color: colors.foreground }]}>
              ₹{hasDiscount ? product.discountedPrice : product.price}
            </Text>
            {hasDiscount && (
              <Text style={styles.pOriginalPrice}>₹{product.price}</Text>
            )}
          </View>
          {quantity === 0 ? (
            <TouchableOpacity
              style={[styles.cartBtn, { backgroundColor: colors.primary }]}
              onPress={() => shopId && addItem(product, shopId)}
              activeOpacity={0.8}
            >
              <Ionicons name="cart-outline" size={16} color="#fff" />
            </TouchableOpacity>
          ) : (
            <View style={[styles.pStepper, { borderColor: colors.primary }]}>
              <TouchableOpacity
                style={styles.pStepBtn}
                onPress={() => updateQuantity(product._id, quantity - 1)}
                activeOpacity={0.7}
              >
                <Ionicons name="remove" size={14} color={colors.primary} />
              </TouchableOpacity>
              <Text style={[styles.pStepQty, { color: colors.primary }]}>{quantity}</Text>
              <TouchableOpacity
                style={styles.pStepBtn}
                onPress={() => shopId && addItem(product, shopId)}
                activeOpacity={0.7}
              >
                <Ionicons name="add" size={14} color={colors.primary} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');

  // Hero banner is fetched live from our Neon database, the same one the
  // website's admin panel writes to — so updating the banner image on the
  // website updates it here too, without an app release.
  const { data: banners = [] } = useQuery<HeroBanner[]>({
    queryKey: ['hero-banners'],
    queryFn: fetchHeroBanners,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
  const banner = banners[0];

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await api.get<unknown>('/categories', false);
      return extractList<Category>(res, 'categories');
    },
  });

  const { data: products = [], isLoading, refetch, isRefetching } = useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: async () => {
      const res = await api.get<unknown>('/products', false);
      return extractList<Product>(res, 'products');
    },
  });

  const filtered = products.filter(p => {
    const matchSearch = (p.name ?? '').toLowerCase().includes(search.toLowerCase());
    const matchCat = category === 'All' || p.category?.toLowerCase() === category.toLowerCase();
    return matchSearch && matchCat;
  });

  const topPad = Platform.OS === 'web' ? 20 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={filtered}
        keyExtractor={p => p._id}
        numColumns={2}
        showsVerticalScrollIndicator={false}
        columnWrapperStyle={styles.row}
        renderItem={({ item }) => <ProductGridCard product={item} />}
        ListHeaderComponent={
          <View style={{ paddingTop: topPad }}>
            {/* Search bar */}
            <View style={styles.headerRow}>
              <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="search-outline" size={18} color={colors.mutedForeground} />
                <TextInput
                  style={[styles.searchInput, { color: colors.foreground }]}
                  placeholder="Search your products here…"
                  placeholderTextColor={colors.mutedForeground}
                  value={search}
                  onChangeText={setSearch}
                  onFocus={() => router.push('/search')}
                />
              </View>
              <TouchableOpacity
                style={[styles.notifBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => router.push('/notifications')}
              >
                <Ionicons name="notifications-outline" size={20} color={colors.foreground} />
                <View style={styles.notifDot} />
              </TouchableOpacity>
            </View>

            {/* Promo banner — the whole card is the website's hero banner image */}
            <TouchableOpacity
              activeOpacity={banner?.redirect_type ? 0.9 : 1}
              style={styles.banner}
              onPress={() => {
                if (banner?.redirect_type === 'internal' && banner.redirect_value) {
                  // best-effort internal navigation; falls back silently if route unknown
                }
              }}
            >
              <Image
                source={{ uri: banner?.image_url || FALLBACK_BANNER_IMAGE }}
                style={styles.bannerImage}
                contentFit="cover"
              />
            </TouchableOpacity>

            {/* Category header */}
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Category</Text>
              <TouchableOpacity onPress={() => router.push('/(customer)/shops')}>
                <Text style={[styles.seeAll, { color: colors.accent }]}>See all</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.catList}
            >
              <TouchableOpacity
                style={[
                  styles.catChip,
                  { backgroundColor: category === 'All' ? colors.accent : colors.card, borderColor: category === 'All' ? colors.accent : colors.border },
                ]}
                onPress={() => setCategory('All')}
              >
                <Text style={[styles.catText, { color: category === 'All' ? '#fff' : colors.foreground }]}>All</Text>
              </TouchableOpacity>
              {categories.map(c => {
                const active = category.toLowerCase() === (c.slug ?? '').toLowerCase() || category.toLowerCase() === (c.name ?? '').toLowerCase();
                return (
                  <TouchableOpacity
                    key={c._id}
                    style={[
                      styles.catChip,
                      { backgroundColor: active ? colors.accent : colors.card, borderColor: active ? colors.accent : colors.border },
                    ]}
                    onPress={() => setCategory(c.slug || c.name)}
                  >
                    {c.emoji && <Text style={styles.catEmoji}>{c.emoji}</Text>}
                    <Text style={[styles.catText, { color: active ? '#fff' : colors.foreground }]}>{c.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Trending header */}
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Trending Near You</Text>
              <TouchableOpacity onPress={() => router.push('/(customer)/shops')}>
                <Text style={[styles.seeAll, { color: colors.accent }]}>See all</Text>
              </TouchableOpacity>
            </View>
          </View>
        }
        contentContainerStyle={[styles.list, { paddingBottom: 90 + insets.bottom }]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.accent} />}
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 40 }} />
          ) : (
            <View style={styles.empty}>
              <Ionicons name="cart-outline" size={48} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No products found</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {search ? 'Try a different search' : 'No products available yet'}
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  searchBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 24, paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 14 },
  notifBtn: {
    width: 46, height: 46, borderRadius: 23, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  notifDot: {
    position: 'absolute', top: 10, right: 11, width: 8, height: 8,
    borderRadius: 4, backgroundColor: '#F97316',
  },
  banner: {
    borderRadius: 18, marginHorizontal: 16, marginTop: 18,
    overflow: 'hidden', aspectRatio: 16 / 9,
  },
  bannerImage: { width: '100%', height: '100%' },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: 16, marginTop: 22, marginBottom: 10,
  },
  sectionTitle: { fontSize: 17, fontWeight: '700' },
  seeAll: { fontSize: 13, fontWeight: '600' },
  catList: { paddingHorizontal: 16, gap: 10, paddingBottom: 4 },
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1,
  },
  catEmoji: { fontSize: 14 },
  catText: { fontSize: 13, fontWeight: '600' },
  row: { paddingHorizontal: 12, gap: 4 },
  list: { paddingBottom: 20 },
  pCard: {
    flex: 1, margin: 4, borderRadius: 16, overflow: 'hidden',
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 6,
  },
  pImageWrap: { position: 'relative' },
  pImage: { width: '100%', height: 130 },
  pImagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  discountBadge: {
    position: 'absolute', top: 8, left: 8, backgroundColor: '#F97316',
    borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3,
  },
  discountBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  newBadge: {
    position: 'absolute', top: 8, right: 8, backgroundColor: '#16A34A',
    borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3,
  },
  newBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  pInfo: { padding: 10 },
  pName: { fontSize: 14, fontWeight: '700' },
  pUnit: { fontSize: 12, marginTop: 2 },
  pBottom: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  pPrice: { fontSize: 15, fontWeight: '800' },
  pOriginalPrice: { fontSize: 12, color: '#9CA3AF', textDecorationLine: 'line-through', marginTop: 1 },
  cartBtn: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
  },
  pStepper: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderRadius: 8, overflow: 'hidden',
  },
  pStepBtn: { paddingHorizontal: 7, paddingVertical: 5 },
  pStepQty: { fontSize: 13, fontWeight: '700', minWidth: 18, textAlign: 'center' },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '600' },
  emptyText: { fontSize: 14 },
});
