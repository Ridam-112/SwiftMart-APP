import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Platform, Dimensions,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useCart } from '@/context/CartContext';
import { DB_BASE_URL } from '@/lib/api';
import { Product } from '@/lib/types';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_W = (SCREEN_W - 16 * 2 - 12) / 2; // 2-column grid with gap

const PAGE_SIZE = 20;

// ─── Product grid card ────────────────────────────────────────────────────────

function ProductCard({ product }: { product: Product }) {
  const colors = useColors();
  const { addItem, updateQuantity, getQuantity } = useCart();

  const image = product.image || product.images?.[0];
  const hasDiscount =
    product.discountedPrice != null && product.discountedPrice < product.price;
  const discountPct = hasDiscount
    ? Math.round(((product.price - product.discountedPrice!) / product.price) * 100)
    : 0;
  const qty = getQuantity(product._id);
  const shopId =
    product.shopId ||
    (typeof product.shop === 'string' ? product.shop : product.shop?._id) ||
    '';

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, width: CARD_W }]}
      activeOpacity={0.85}
      onPress={() =>
        router.push({ pathname: '/product/[id]', params: { id: product._id } })
      }
    >
      <View style={styles.cardImgWrap}>
        {image ? (
          <Image
            source={{ uri: image }}
            style={styles.cardImg}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View
            style={[
              styles.cardImg,
              {
                backgroundColor: colors.muted,
                alignItems: 'center',
                justifyContent: 'center',
              },
            ]}
          >
            <Ionicons
              name="image-outline"
              size={28}
              color={colors.mutedForeground}
            />
          </View>
        )}
        {hasDiscount && (
          <View style={styles.discBadge}>
            <Text style={styles.discBadgeText}>{discountPct}% off</Text>
          </View>
        )}
      </View>

      <View style={styles.cardBody}>
        <Text
          style={[styles.cardName, { color: colors.foreground }]}
          numberOfLines={2}
        >
          {product.name}
        </Text>
        {product.unit ? (
          <Text style={[styles.cardUnit, { color: colors.mutedForeground }]}>
            {product.unit}
          </Text>
        ) : null}
        {product.shopName ? (
          <Text
            style={[styles.cardShop, { color: colors.mutedForeground }]}
            numberOfLines={1}
          >
            {product.shopName}
          </Text>
        ) : null}

        <View style={styles.cardFooter}>
          <View>
            <Text style={[styles.cardPrice, { color: colors.foreground }]}>
              ₹{hasDiscount ? product.discountedPrice : product.price}
            </Text>
            {hasDiscount && (
              <Text style={styles.cardStrike}>₹{product.price}</Text>
            )}
          </View>

          {qty === 0 ? (
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: colors.primary }]}
              onPress={() => shopId && addItem(product, shopId)}
              activeOpacity={0.8}
            >
              <Text style={styles.addBtnText}>ADD</Text>
            </TouchableOpacity>
          ) : (
            <View
              style={[styles.stepper, { borderColor: colors.primary }]}
            >
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => updateQuantity(product._id, qty - 1)}
              >
                <Ionicons
                  name="remove"
                  size={14}
                  color={colors.primary}
                />
              </TouchableOpacity>
              <Text
                style={[styles.stepQty, { color: colors.primary }]}
              >
                {qty}
              </Text>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => shopId && addItem(product, shopId)}
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

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function SectionDetailScreen() {
  const { id, title } = useLocalSearchParams<{ id: string; title: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'web' ? 16 : insets.top;

  const [products, setProducts] = useState<Product[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(0);

  // Fetch a page and append to list
  const fetchPage = useCallback(
    async (pg: number) => {
      try {
        const res = await fetch(
          `${DB_BASE_URL}/homepage-sections/${id}/products?page=${pg}&limit=${PAGE_SIZE}`,
        );
        if (!res.ok) throw new Error('Failed to load products');
        const json = await res.json();
        const incoming: Product[] = (json.products ?? []) as Product[];
        setProducts(prev => (pg === 1 ? incoming : [...prev, ...incoming]));
        setHasMore(json.hasMore ?? false);
        setTotal(json.total ?? 0);
      } catch (err) {
        console.error('Section fetch error:', err);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [id],
  );

  // Load page 1 on mount
  React.useEffect(() => {
    setLoading(true);
    fetchPage(1);
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    const next = page + 1;
    setPage(next);
    setLoadingMore(true);
    fetchPage(next);
  }, [fetchPage, hasMore, loadingMore, page]);

  const isCombo =
    (title ?? '')
      .toLowerCase()
      .match(/combo|saver|hot pick/) != null;

  const headerBg = isCombo ? '#1C0A00' : colors.background;
  const headerText = isCombo ? '#fff' : colors.foreground;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { paddingTop: topPad + 8, backgroundColor: headerBg },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.backBtn,
            { backgroundColor: isCombo ? 'rgba(255,255,255,0.12)' : colors.card },
          ]}
          onPress={() => router.back()}
          activeOpacity={0.8}
        >
          <Ionicons
            name="arrow-back"
            size={20}
            color={isCombo ? '#fff' : colors.foreground}
          />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          {isCombo && (
            <View style={styles.hotBadge}>
              <Ionicons name="flame" size={11} color="#fff" />
              <Text style={styles.hotBadgeText}>Hot Pick</Text>
            </View>
          )}
          <Text
            style={[styles.headerTitle, { color: headerText }]}
            numberOfLines={1}
          >
            {title ?? 'Section'}
          </Text>
          {total > 0 && (
            <Text
              style={[
                styles.headerCount,
                { color: isCombo ? 'rgba(255,255,255,0.6)' : colors.mutedForeground },
              ]}
            >
              {total} products
            </Text>
          )}
        </View>

        {/* Spacer to balance back button */}
        <View style={{ width: 40 }} />
      </View>

      {/* Product grid */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
            Loading products…
          </Text>
        </View>
      ) : products.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons
            name="cube-outline"
            size={56}
            color={colors.mutedForeground}
          />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            No products in this section yet
          </Text>
        </View>
      ) : (
        <FlatList
          data={products}
          numColumns={2}
          keyExtractor={p => p._id}
          columnWrapperStyle={styles.row}
          contentContainerStyle={[
            styles.grid,
            { paddingBottom: 100 + insets.bottom },
          ]}
          showsVerticalScrollIndicator={false}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          renderItem={({ item }) => <ProductCard product={item} />}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator
                size="small"
                color={colors.accent}
                style={{ marginVertical: 20 }}
              />
            ) : null
          }
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  hotBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F97316',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 4,
    alignSelf: 'center',
  },
  hotBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  headerTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  headerCount: { fontSize: 12, marginTop: 2 },

  // Loading / empty
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: { fontSize: 14 },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 40,
  },
  emptyText: { fontSize: 15, textAlign: 'center' },

  // Grid
  grid: { paddingHorizontal: 16, paddingTop: 16 },
  row: { justifyContent: 'space-between', marginBottom: 12 },

  // Card
  card: {
    borderRadius: 14,
    overflow: 'hidden',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  cardImgWrap: { position: 'relative' },
  cardImg: { width: '100%', aspectRatio: 1 },
  discBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: '#F97316',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  discBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  cardBody: { padding: 10 },
  cardName: { fontSize: 13, fontWeight: '700', lineHeight: 18 },
  cardUnit: { fontSize: 11, marginTop: 1 },
  cardShop: { fontSize: 11, marginTop: 2 },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  cardPrice: { fontSize: 15, fontWeight: '800' },
  cardStrike: {
    fontSize: 10,
    color: '#9CA3AF',
    textDecorationLine: 'line-through',
    marginTop: 1,
  },
  addBtn: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  addBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 8,
    overflow: 'hidden',
  },
  stepBtn: { paddingHorizontal: 8, paddingVertical: 5 },
  stepQty: {
    fontSize: 13,
    fontWeight: '700',
    minWidth: 20,
    textAlign: 'center',
  },
});
