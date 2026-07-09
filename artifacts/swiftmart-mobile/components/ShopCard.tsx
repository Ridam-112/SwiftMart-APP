import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { Shop } from '@/lib/types';

interface Props { shop: Shop; onPress: () => void; }

export function ShopCard({ shop, onPress }: Props) {
  const colors = useColors();
  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {shop.image || shop.coverImage ? (
        <Image
          source={{ uri: shop.image || shop.coverImage }}
          style={styles.image}
          contentFit="cover"
          transition={200}
        />
      ) : (
        <View style={[styles.imagePlaceholder, { backgroundColor: colors.muted }]}>
          <Ionicons name="storefront-outline" size={36} color={colors.mutedForeground} />
        </View>
      )}
      {shop.isOpen === false && (
        <View style={[styles.closedOverlay]}>
          <Text style={styles.closedOverlayText}>Closed</Text>
        </View>
      )}
      <View style={styles.info}>
        <View style={styles.row}>
          <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
            {shop.name}
          </Text>
          {shop.rating != null && (
            <View style={[styles.ratingBadge, { backgroundColor: colors.secondary }]}>
              <Ionicons name="star" size={11} color={colors.primary} />
              <Text style={[styles.ratingText, { color: colors.primary }]}>
                {shop.rating.toFixed(1)}
              </Text>
            </View>
          )}
        </View>
        {shop.category && (
          <Text style={[styles.category, { color: colors.mutedForeground }]}>
            {shop.category}
          </Text>
        )}
        <View style={styles.meta}>
          {shop.deliveryTime && (
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={12} color={colors.mutedForeground} />
              <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                {shop.deliveryTime}
              </Text>
            </View>
          )}
          {shop.deliveryFee != null && (
            <View style={styles.metaItem}>
              <Ionicons name="bicycle-outline" size={12} color={colors.mutedForeground} />
              <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                {shop.deliveryFee === 0 ? 'Free delivery' : `₹${shop.deliveryFee} delivery`}
              </Text>
            </View>
          )}
          {shop.minOrder != null && (
            <View style={styles.metaItem}>
              <Ionicons name="bag-outline" size={12} color={colors.mutedForeground} />
              <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                Min ₹{shop.minOrder}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 1,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
  },
  image: { width: '100%', height: 140 },
  imagePlaceholder: {
    width: '100%',
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closedOverlay: {
    ...StyleSheet.absoluteFillObject,
    height: 140,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closedOverlayText: { color: '#fff', fontWeight: '700', fontSize: 16, letterSpacing: 1 },
  info: { padding: 12 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { fontSize: 16, fontWeight: '700', flex: 1, marginRight: 8 },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 20,
  },
  ratingText: { fontSize: 12, fontWeight: '700' },
  category: { fontSize: 13, marginTop: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 12 },
});
