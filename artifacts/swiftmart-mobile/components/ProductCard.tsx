import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { Product } from '@/lib/types';

interface Props {
  product: Product;
  quantity: number;
  onAdd: () => void;
  onRemove: () => void;
  onPress?: () => void;
}

export function ProductCard({ product, quantity, onAdd, onRemove, onPress }: Props) {
  const colors = useColors();

  function handleAdd() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onAdd();
  }

  function handleRemove() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onRemove();
  }

  const available = product.isAvailable !== false && (product.stock == null || product.stock > 0);
  const imageUri = product.images?.[0] || product.image;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, opacity: available ? 1 : 0.5 }]}
      activeOpacity={onPress ? 0.85 : 1}
      onPress={onPress}
    >
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.image} contentFit="cover" transition={200} />
      ) : (
        <View style={[styles.imagePlaceholder, { backgroundColor: colors.muted }]}>
          <Ionicons name="image-outline" size={28} color={colors.mutedForeground} />
        </View>
      )}
      <View style={styles.info}>
        <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={2}>
          {product.name}
        </Text>
        {product.unit && (
          <Text style={[styles.unit, { color: colors.mutedForeground }]}>{product.unit}</Text>
        )}
        <View style={styles.bottom}>
          <Text style={[styles.price, { color: colors.foreground }]}>
            ₹{product.price}
          </Text>
          {available ? (
            quantity === 0 ? (
              <TouchableOpacity
                style={[styles.addBtn, { backgroundColor: colors.primary }]}
                onPress={handleAdd}
                activeOpacity={0.8}
              >
                <Text style={[styles.addBtnText, { color: colors.primaryForeground }]}>Add</Text>
              </TouchableOpacity>
            ) : (
              <View style={[styles.stepper, { borderColor: colors.primary }]}>
                <TouchableOpacity onPress={handleRemove} style={styles.stepBtn}>
                  <Ionicons name="remove" size={16} color={colors.primary} />
                </TouchableOpacity>
                <Text style={[styles.qty, { color: colors.primary }]}>{quantity}</Text>
                <TouchableOpacity onPress={handleAdd} style={styles.stepBtn}>
                  <Ionicons name="add" size={16} color={colors.primary} />
                </TouchableOpacity>
              </View>
            )
          ) : (
            <Text style={[styles.unavailable, { color: colors.mutedForeground }]}>Out of stock</Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    flex: 1,
    margin: 4,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  image: { width: '100%', height: 110 },
  imagePlaceholder: { width: '100%', height: 110, alignItems: 'center', justifyContent: 'center' },
  info: { padding: 8 },
  name: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  unit: { fontSize: 11, marginTop: 2 },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  price: { fontSize: 15, fontWeight: '700' },
  addBtn: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 8 },
  addBtnText: { fontSize: 13, fontWeight: '700' },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 8, overflow: 'hidden' },
  stepBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  qty: { fontSize: 13, fontWeight: '700', minWidth: 20, textAlign: 'center' },
  unavailable: { fontSize: 11, fontStyle: 'italic' },
});
