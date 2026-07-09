import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  RefreshControl, ActivityIndicator, Platform,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { ShopCard } from '@/components/ShopCard';
import { api, extractList, normalizeShop } from '@/lib/api';
import { Shop } from '@/lib/types';

const CATEGORIES = ['All', 'Grocery', 'Fruits & Veg', 'Dairy', 'Bakery', 'Restaurant', 'Pharmacy', 'Snacks'];

export default function ShopsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');

  const { data: shops = [], isLoading, refetch, isRefetching } = useQuery<Shop[]>({
    queryKey: ['shops'],
    queryFn: async () => {
      const res = await api.get<unknown>('/shops');
      return extractList<Shop>(res, 'shops').map(normalizeShop<Shop>);
    },
  });

  const filtered = shops.filter(s => {
    const matchSearch = (s.name ?? '').toLowerCase().includes(search.toLowerCase());
    const matchCat = category === 'All' || s.category?.toLowerCase().includes(category.toLowerCase());
    return matchSearch && matchCat;
  });

  const topPad = Platform.OS === 'web' ? 20 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <LinearGradient colors={['#15803D', '#22C55E']} style={[styles.headerGrad, { paddingTop: topPad + 12 }]}>
        <View style={styles.headerTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>Hello, {user?.name?.split(' ')[0]} 👋</Text>
            <View style={styles.locationRow}>
              <Ionicons name="location-sharp" size={14} color="rgba(255,255,255,0.9)" />
              <Text style={styles.location}>Deliver to current location</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.notifBtn} onPress={() => router.push('/notifications')}>
            <Ionicons name="notifications-outline" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
        {/* Search bar */}
        <View style={[styles.searchBar, { backgroundColor: '#fff' }]}>
          <Ionicons name="search-outline" size={18} color="#6B7280" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search shops or items…"
            placeholderTextColor="#9CA3AF"
            value={search}
            onChangeText={setSearch}
            onFocus={() => router.push('/search')}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color="#9CA3AF" />
            </TouchableOpacity>
          )}
        </View>
      </LinearGradient>

      <FlatList
        data={filtered}
        keyExtractor={s => s._id}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <ShopCard
            shop={item}
            onPress={() => router.push({ pathname: '/shop/[id]', params: { id: item._id } })}
          />
        )}
        ListHeaderComponent={
          <>
            {/* Category chips */}
            <FlatList
              horizontal
              data={CATEGORIES}
              keyExtractor={c => c}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.catList}
              renderItem={({ item: c }) => (
                <TouchableOpacity
                  style={[
                    styles.catChip,
                    {
                      backgroundColor: c === category ? colors.primary : colors.card,
                      borderColor: c === category ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => setCategory(c)}
                >
                  <Text style={[styles.catText, { color: c === category ? '#fff' : colors.foreground }]}>{c}</Text>
                </TouchableOpacity>
              )}
            />
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              {category === 'All' ? 'Nearby Shops' : category}
              {filtered.length > 0 && (
                <Text style={{ color: colors.mutedForeground, fontSize: 14, fontWeight: '400' }}>
                  {' '}({filtered.length})
                </Text>
              )}
            </Text>
          </>
        }
        contentContainerStyle={[styles.list, { paddingBottom: 90 + insets.bottom }]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
          ) : (
            <View style={styles.empty}>
              <Ionicons name="storefront-outline" size={48} color={colors.mutedForeground} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No shops found</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                {search ? 'Try a different search' : 'No shops available yet'}
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
  headerGrad: { paddingHorizontal: 16, paddingBottom: 20 },
  headerTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  greeting: { color: '#fff', fontSize: 18, fontWeight: '700' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  location: { color: 'rgba(255,255,255,0.9)', fontSize: 12 },
  notifBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
  },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#111827' },
  catList: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4, gap: 8 },
  catChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  catText: { fontSize: 13, fontWeight: '600' },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginHorizontal: 16, marginTop: 12, marginBottom: 4 },
  list: { paddingHorizontal: 16 },
  empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '600' },
  emptyText: { fontSize: 14 },
});
