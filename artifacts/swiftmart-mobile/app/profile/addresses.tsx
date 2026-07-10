import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { showAlert } from '@/lib/alert';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/context/AuthContext';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Address } from '@/lib/types';

const EMPTY: Address = { street: '', city: '', state: '', pincode: '' };

export default function SavedAddressesScreen() {
  const colors = useColors();
  const { user, updateUser } = useAuth();
  const addresses: Address[] = user?.addresses ?? [];

  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<number | null>(null); // index or null = new
  const [form, setForm] = useState<Address>(EMPTY);

  function openNew() {
    setEditing(null);
    setForm(EMPTY);
    setModalVisible(true);
  }

  function openEdit(idx: number) {
    setEditing(idx);
    setForm({ ...addresses[idx] });
    setModalVisible(true);
  }

  function handleDelete(idx: number) {
    showAlert('Delete Address', 'Remove this address?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          const next = addresses.filter((_, i) => i !== idx);
          updateUser({ addresses: next });
        },
      },
    ]);
  }

  function handleSave() {
    if (!form.street.trim() || !form.city.trim() || !form.state.trim() || !form.pincode.trim()) {
      showAlert('Incomplete', 'Please fill in all fields.');
      return;
    }
    const next = [...addresses];
    if (editing !== null) {
      next[editing] = form;
    } else {
      next.push(form);
    }
    updateUser({ addresses: next });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setModalVisible(false);
  }

  const setF = useCallback((k: keyof Address) => (v: string) => setForm(f => ({ ...f, [k]: v })), []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Saved Addresses"
        rightElement={
          <TouchableOpacity onPress={openNew} activeOpacity={0.7}>
            <Ionicons name="add" size={24} color={colors.primary} />
          </TouchableOpacity>
        }
      />

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {addresses.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="location-outline" size={56} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No Saved Addresses</Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Add a delivery address to speed up checkout.
            </Text>
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: colors.primary }]}
              onPress={openNew}
              activeOpacity={0.85}
            >
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={styles.addBtnText}>Add Address</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.list}>
            {addresses.map((addr, i) => (
              <View key={i} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.cardIcon, { backgroundColor: colors.secondary }]}>
                  <Ionicons name={i === 0 ? 'home-outline' : 'location-outline'} size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                    {i === 0 ? 'Home' : `Address ${i + 1}`}
                  </Text>
                  <Text style={[styles.cardAddr, { color: colors.mutedForeground }]}>
                    {addr.street}, {addr.city}, {addr.state} – {addr.pincode}
                  </Text>
                </View>
                <View style={styles.cardActions}>
                  <TouchableOpacity onPress={() => openEdit(i)} style={styles.iconBtn}>
                    <Ionicons name="pencil-outline" size={18} color={colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(i)} style={styles.iconBtn}>
                    <Ionicons name="trash-outline" size={18} color={colors.destructive} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            <TouchableOpacity
              style={[styles.addOutlineBtn, { borderColor: colors.primary }]}
              onPress={openNew}
              activeOpacity={0.85}
            >
              <Ionicons name="add" size={18} color={colors.primary} />
              <Text style={[styles.addOutlineBtnText, { color: colors.primary }]}>Add New Address</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Add / Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                  {editing !== null ? 'Edit Address' : 'New Address'}
                </Text>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <Ionicons name="close" size={22} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
              {(
                [
                  { key: 'street', label: 'Street / House No.', placeholder: '12, MG Road, Flat 4B' },
                  { key: 'city',   label: 'City',               placeholder: 'Kolkata' },
                  { key: 'state',  label: 'State',              placeholder: 'West Bengal' },
                  { key: 'pincode',label: 'Pincode',            placeholder: '700001', kbType: 'number-pad' as const },
                ] as const
              ).map(f => (
                <View key={f.key} style={styles.modalField}>
                  <Text style={[styles.label, { color: colors.mutedForeground }]}>{f.label}</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
                    value={form[f.key as keyof Address]}
                    onChangeText={setF(f.key as keyof Address)}
                    placeholder={f.placeholder}
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType={'kbType' in f ? f.kbType : 'default'}
                  />
                </View>
              ))}
              <TouchableOpacity
                style={[styles.saveBtn, { backgroundColor: colors.primary }]}
                onPress={handleSave}
                activeOpacity={0.85}
              >
                <Text style={styles.saveBtnText}>Save Address</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { padding: 16, flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyText: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32, lineHeight: 20 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, marginTop: 8 },
  addBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  list: { gap: 12 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  cardIcon: { width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  cardAddr: { fontSize: 13, lineHeight: 18 },
  cardActions: { flexDirection: 'row', gap: 4 },
  iconBtn: { padding: 8 },
  addOutlineBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 14, paddingVertical: 14, marginTop: 4 },
  addOutlineBtnText: { fontSize: 14, fontWeight: '700' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 12 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  modalTitle: { fontSize: 17, fontWeight: '700' },
  modalField: { gap: 6 },
  label: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  input: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15 },
  saveBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
