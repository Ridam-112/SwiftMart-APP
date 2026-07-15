import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  Platform, ScrollView, Dimensions, RefreshControl, ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useCart } from '@/context/CartContext';
import { api, extractList, DB_BASE_URL } from '@/lib/api';
import { Product, Category, HeroBanner, HomepageSection, Shop } from '@/lib/types';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = 148;
const FALLBACK_BANNER = 'https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=800&q=80';

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchHeroBanners(): Promise<HeroBanner[]> {
  const res = await fetch(`${DB_BASE_URL}/hero-banners`);
  if (!res.ok) throw new Error('Failed to load banners');
  const json = await res.json();
  return (json.banners ?? []) as HeroBanner[];
}

async function fetchHomepageSections(): Promise<HomepageSection[]> {
  const res = await fetch(`${DB_BASE_URL}/homepage-sections`);
  if (!res.ok) throw new Error('Failed to load sections');
  const json = await res.json();
  return (json.sections ?? []) as HomepageSection[];
}

// ─── Hero banner carousel ────────────────────────────────────────────────────

function BannerCarousel({ banners }: { banners: HeroBanner[] }) {
  const [active, setActive] = useState(0);
  const ref = useRef<ScrollView>(null);
  const list = banners.length > 0 ? banners : [{ id: 'fb', image_url: FALLBACK_BANNER }];

  useEffect(() => {
    if (list.length <= 1) return;
    const t = setInterval(() => {
      setActive(prev => {
        const next = (prev + 1) % list.length;
        ref.current?.scrollTo({ x: next * SCREEN_W, animated: true });
        return next;
      });
    }, 4000);
    return () => clearInterval(t);
  }, [list.length]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onScroll = useCallback((e: any) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    setActive(idx);
  }, []);

  return (
    <View style={styles.bannerWrap}>
      <ScrollView
        ref={ref}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {list.map((b, i) => (
          <View key={b.id ?? i} style={styles.bannerSlide}>
            <Image
              source={{ uri: b.image_url || FALLBACK_BANNER }}
              style={styles.bannerImage}
              contentFit="cover"
              transition={300}
            />
            {(b.title || b.subtitle) && (
              <View style={styles.bannerOverlay}>
                {b.title && <Text style={styles.bannerTitle}>{b.title}</Text>}
                {b.subtitle && <Text style={styles.bannerSubtitle}>{b.subtitle}</Text>}
              </View>
            )}
          </View>
        ))}
      </ScrollView>
      {list.length > 1 && (
        <View style={styles.dotRow}>
          {list.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === active && styles.dotActive]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Product card for section rows ──────────────────────────────────────────

function SectionProductCard({ product, dark }: { product: Product; dark?: boolean }) {
  const colors = useColors();
  const { addItem, updateQuantity, getQuantity } = useCart();

  const image = product.image || product.images?.[0];
  const hasDiscount = product.discountedPrice != null && product.discountedPrice < product.price;
  const discountPct = hasDiscount
    ? Math.round(((product.price - product.discountedPrice!) / product.price) * 100)
    : 0;
  const qty = getQuantity(product._id);
  const shopId =
    product.shopId ||
    (typeof product.shop === 'string' ? product.shop : product.shop?._id) ||
    '';

  const cardBg = dark ? 'rgba(255,255,255,0.1)' : colors.card;
  const textColor = dark ? '#fff' : colors.foreground;
  const mutedColor = dark ? 'rgba(255,255,255,0.6)' : colors.mutedForeground;

  return (
    <TouchableOpacity
      style={[styles.pCard, { backgroundColor: cardBg }]}
      activeOpacity={0.85}
      onPress={() => router.push({ pathname: '/product/[id]', params: { id: product._id } })}
    >
      <View style={styles.pImageWrap}>
        {image ? (
          <Image source={{ uri: image }} style={styles.pImage} contentFit="cover" transition={200} />
        ) : (
          <View style={[styles.pImage, { backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' }]}>
            <Ionicons name="image-outline" size={22} color={colors.mutedForeground} />
          </View>
        )}
        {hasDiscount && (
          <View style={styles.discountBadge}>
            <Text style={styles.discountBadgeText}>{discountPct}% off</Text>
          </View>
        )}
      </View>
      <View style={styles.pInfo}>
        <Text style={[styles.pName, { color: textColor }]} numberOfLines={1}>{product.name}</Text>
        {product.unit && <Text style={[styles.pUnit, { color: mutedColor }]}>{product.unit}</Text>}
        {product.shopName && (
          <Text style={[styles.pShop, { color: mutedColor }]} numberOfLines={1}>
            {product.shopName}
          </Text>
        )}
        <View style={styles.pBottom}>
          <View>
            <Text style={[styles.pPrice, { color: textColor }]}>
              ₹{hasDiscount ? product.discountedPrice : product.price}
            </Text>
            {hasDiscount && (
              <Text style={styles.pStrike}>₹{product.price}</Text>
            )}
          </View>
          {qty === 0 ? (
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: dark ? '#F97316' : colors.primary }]}
              onPress={() => shopId && addItem(product, shopId)}
              activeOpacity={0.8}
            >
              <Text style={styles.addBtnText}>ADD</Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.stepper, { borderColor: dark ? '#F97316' : colors.primary }]}>
              <TouchableOpacity style={styles.stepBtn} onPress={() => updateQuantity(product._id, qty - 1)}>
                <Ionicons name="remove" size={12} color={dark ? '#F97316' : colors.primary} />
              </TouchableOpacity>
              <Text style={[styles.stepQty, { color: dark ? '#F97316' : colors.primary }]}>{qty}</Text>
              <TouchableOpacity style={styles.stepBtn} onPress={() => shopId && addItem(product, shopId)}>
                <Ionicons name="add" size={12} color={dark ? '#F97316' : colors.primary} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Combo / Hot-Pick section (dark highlighted card) ────────────────────────

function ComboSection({ section }: { section: HomepageSection }) {
  return (
    <View style={styles.comboWrap}>
      <View style={styles.hotPickBadge}>
        <Ionicons name="flame" size={11} color="#fff" />
        <Text style={styles.hotPickText}>Hot Pick</Text>
      </View>
      <View style={styles.comboHeader}>
        <Text style={styles.comboTitle}>{section.title}</Text>
        <TouchableOpacity onPress={() => router.push('/(customer)/shops')}>
          <Text style={styles.comboSeeAll}>See all</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={section.products}
        horizontal
        keyExtractor={p => p._id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 10, paddingBottom: 4 }}
        renderItem={({ item }) => <SectionProductCard product={item} dark />}
      />
    </View>
  );
}

// ─── Standard section row ────────────────────────────────────────────────────

function SectionRow({ section }: { section: HomepageSection }) {
  const colors = useColors();
  const isTrending = section.type === 'trending';

  return (
    <View style={{ marginBottom: 4 }}>
      <View style={styles.sectionHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {isTrending && <Ionicons name="trending-up" size={17} color={colors.accent} />}
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{section.title}</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/(customer)/shops')}>
          <Text style={[styles.seeAll, { color: colors.accent }]}>See all</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={section.products}
        horizontal
        keyExtractor={p => p._id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 10, paddingBottom: 4 }}
        renderItem={({ item }) => <SectionProductCard product={item} />}
      />
    </View>
  );
}

// ─── Popular shops row ────────────────────────────────────────────────────────

function PopularShopsRow() {
  const colors = useColors();
  const { data: shops = [] } = useQuery<Shop[]>({
    queryKey: ['shops-popular'],
    queryFn: async () => {
      const res = await api.get<unknown>('/shops', false);
      return extractList<Shop>(res, 'shops').slice(0, 12);
    },
    staleTime: 120_000,
  });

  if (shops.length === 0) return null;

  return (
    <View style={{ marginBottom: 4 }}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Popular Shops</Text>
        <TouchableOpacity onPress={() => router.push('/(customer)/shops')}>
          <Text style={[styles.seeAll, { color: colors.accent }]}>See all</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={shops}
        horizontal
        keyExtractor={s => s._id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 12, paddingBottom: 4 }}
        renderItem={({ item: shop }) => (
          <TouchableOpacity
            style={[styles.shopCard, { backgroundColor: colors.card }]}
            activeOpacity={0.85}
            onPress={() => router.push({ pathname: '/shop/[id]' as never, params: { id: shop._id } })}
          >
            {(shop.image || shop.coverImage) ? (
              <Image
                source={{ uri: (shop.image || shop.coverImage)! }}
                style={styles.shopImage}
                contentFit="cover"
                transition={200}
              />
            ) : (
              <View style={[styles.shopImage, { backgroundColor: colors.muted, alignItems: 'center', justifyContent: 'center' }]}>
                <Ionicons name="storefront-outline" size={26} color={colors.mutedForeground} />
              </View>
            )}
            <Text style={[styles.shopName, { color: colors.foreground }]} numberOfLines={1}>
              {shop.name || shop.shopName}
            </Text>
            {shop.category && (
              <Text style={[styles.shopCat, { color: colors.mutedForeground }]} numberOfLines={1}>
                {shop.category}
              </Text>
            )}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

// ─── Category icon strip ─────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, string> = {
  grocery: '🛒', vegetables: '🥦', fruits: '🍎', bakery: '🍞',
  dairy: '🥛', snacks: '🍿', drinks: '🥤', restaurant: '🍽️',
  electronics: '📱', fashion: '👗', stationary: '📚', 'fast-food': '🍔',
  'fast food': '🍔', 'ice cream': '🍦', default: '🏪',
};

function CategoryStrip({ categories }: { categories: Category[] }) {
  const colors = useColors();

  return (
    <View style={{ marginBottom: 8 }}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Shop by Category</Text>
        <TouchableOpacity onPress={() => router.push('/(customer)/shops')}>
          <Text style={[styles.seeAll, { color: colors.accent }]}>See all</Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 16, paddingBottom: 4 }}
      >
        {categories.map(c => {
          const key = (c.slug ?? c.name ?? '').toLowerCase();
          const emoji = CATEGORY_ICONS[key] ?? CATEGORY_ICONS.default;
          return (
            <TouchableOpacity
              key={c._id}
              style={styles.catItem}
              activeOpacity={0.8}
              onPress={() => router.push('/(customer)/shops')}
            >
              <View style={[styles.catCircle, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={styles.catEmoji}>{emoji}</Text>
              </View>
              <Text style={[styles.catLabel, { color: colors.foreground }]} numberOfLines={1}>{c.name}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 20 : insets.top;
  const [refreshing, setRefreshing] = useState(false);

  const { data: banners = [] } = useQuery<HeroBanner[]>({
    queryKey: ['hero-banners'],
    queryFn: fetchHeroBanners,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: async () => {
      const res = await api.get<unknown>('/categories', false);
      return extractList<Category>(res, 'categories');
    },
    staleTime: 120_000,
  });

  const {
    data: sections = [],
    isLoading: sectionsLoading,
    refetch: refetchSections,
  } = useQuery<HomepageSection[]>({
    queryKey: ['homepage-sections'],
    queryFn: fetchHomepageSections,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetchSections();
    setRefreshing(false);
  }, [refetchSections]);

  // Detect "combo/saver" sections for special hot-pick styling
  const isComboSection = (s: HomepageSection) => {
    const t = s.title.toLowerCase();
    return t.includes('combo') || t.includes('saver') || t.includes('hot pick');
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 + insets.bottom }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
      >
        {/* Top padding + search */}
        <View style={{ paddingTop: topPad }}>
          <View style={styles.headerRow}>
            <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Ionicons name="search-outline" size={18} color={colors.mutedForeground} />
              <TextInput
                style={[styles.searchInput, { color: colors.foreground }]}
                placeholder="Search your products here…"
                placeholderTextColor={colors.mutedForeground}
                editable={false}
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
        </View>

        {/* Hero banner carousel */}
        <BannerCarousel banners={banners} />

        {/* Sections */}
        {sectionsLoading ? (
          <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Render sections in order — combo sections get special dark card */}
            {sections.map(section => {
              if (section.products.length === 0) return null;
              if (isComboSection(section)) {
                return <ComboSection key={section._id} section={section} />;
              }
              return <SectionRow key={section._id} section={section} />;
            })}

            {/* Inject category strip + popular shops after first section */}
            {sections.length > 0 && (
              <>
                <CategoryStrip categories={categories} />
                <PopularShopsRow />
              </>
            )}

            {/* If no sections loaded at all, still show categories + shops */}
            {sections.length === 0 && (
              <>
                <CategoryStrip categories={categories} />
                <PopularShopsRow />
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  headerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, marginBottom: 14,
  },
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

  // Banner
  bannerWrap: { marginHorizontal: 16, marginBottom: 22, borderRadius: 18, overflow: 'hidden' },
  bannerSlide: { width: SCREEN_W - 32, aspectRatio: 16 / 7, position: 'relative' },
  bannerImage: { width: '100%', height: '100%' },
  bannerOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 14, backgroundColor: 'rgba(0,0,0,0.45)',
  },
  bannerTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  bannerSubtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 },
  dotRow: {
    position: 'absolute', bottom: 8, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', gap: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.45)' },
  dotActive: { backgroundColor: '#fff', width: 18 },

  // Section headers
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, marginBottom: 12, marginTop: 20,
  },
  sectionTitle: { fontSize: 17, fontWeight: '700' },
  seeAll: { fontSize: 13, fontWeight: '600' },

  // Category strip
  catItem: { alignItems: 'center', width: 68 },
  catCircle: {
    width: 56, height: 56, borderRadius: 28, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  catEmoji: { fontSize: 24 },
  catLabel: { fontSize: 11, fontWeight: '500', textAlign: 'center' },

  // Product card
  pCard: {
    width: CARD_W, borderRadius: 14, overflow: 'hidden',
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07, shadowRadius: 4,
  },
  pImageWrap: { position: 'relative' },
  pImage: { width: CARD_W, height: 120 },
  discountBadge: {
    position: 'absolute', top: 6, left: 6, backgroundColor: '#F97316',
    borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2,
  },
  discountBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  pInfo: { padding: 9 },
  pName: { fontSize: 13, fontWeight: '700' },
  pUnit: { fontSize: 11, marginTop: 1 },
  pShop: { fontSize: 11, marginTop: 2 },
  pBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  pPrice: { fontSize: 14, fontWeight: '800' },
  pStrike: { fontSize: 10, color: '#9CA3AF', textDecorationLine: 'line-through', marginTop: 1 },
  addBtn: { borderRadius: 7, paddingHorizontal: 10, paddingVertical: 5 },
  addBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  stepper: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderRadius: 7, overflow: 'hidden',
  },
  stepBtn: { paddingHorizontal: 6, paddingVertical: 4 },
  stepQty: { fontSize: 12, fontWeight: '700', minWidth: 16, textAlign: 'center' },

  // Combo / Hot Pick
  comboWrap: {
    marginHorizontal: 16, marginTop: 20, marginBottom: 4,
    borderRadius: 18, overflow: 'hidden',
    backgroundColor: '#1C0A00',
    paddingTop: 14, paddingBottom: 16,
  },
  hotPickBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginHorizontal: 16, marginBottom: 8, alignSelf: 'flex-start',
    backgroundColor: '#F97316', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  hotPickText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  comboHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, marginBottom: 12,
  },
  comboTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  comboSeeAll: { color: '#FBBF24', fontSize: 13, fontWeight: '600' },

  // Shops
  shopCard: {
    width: 100, borderRadius: 14, overflow: 'hidden',
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07, shadowRadius: 4,
  },
  shopImage: { width: 100, height: 80 },
  shopName: { fontSize: 12, fontWeight: '600', padding: 8, paddingBottom: 2 },
  shopCat: { fontSize: 10, paddingHorizontal: 8, paddingBottom: 8 },
});
