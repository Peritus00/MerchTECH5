import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { MaterialIcons } from '@expo/vector-icons';
import { couponAPI } from '@/services/api';

export default function CouponsSettingsScreen() {
  const router = useRouter();
  const [coupons, setCoupons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [code, setCode] = useState('');
  const [discountValue, setDiscountValue] = useState('');
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent');

  useEffect(() => {
    loadCoupons();
  }, []);

  const loadCoupons = async () => {
    try {
      const data = await couponAPI.list();
      setCoupons(Array.isArray(data) ? data : []);
    } catch (e) {
      setCoupons([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!code.trim()) {
      Alert.alert('Error', 'Enter a coupon code.');
      return;
    }
    const val = parseFloat(discountValue);
    if (isNaN(val) || val <= 0) {
      Alert.alert('Error', 'Enter a valid discount value.');
      return;
    }
    setCreating(true);
    try {
      await couponAPI.create({
        code: code.trim().toUpperCase(),
        discountType,
        discountValue: val,
      });
      setCode('');
      setDiscountValue('');
      loadCoupons();
      if (Platform.OS === 'web') {
        window.alert('Coupon created successfully.');
      } else {
        Alert.alert('Success', 'Coupon created successfully.');
      }
    } catch (e: any) {
      const msg = e.response?.data?.error || e.message || 'Failed to create coupon.';
      Alert.alert('Error', msg);
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ActivityIndicator size="large" color="#3b82f6" style={{ marginTop: 24 }} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <ThemedText type="title" style={styles.title}>My Coupons</ThemedText>
        <ThemedText style={styles.subtitle}>Create discount codes for your products and playlists.</ThemedText>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Coupon code (e.g. SAVE20)"
            placeholderTextColor="#9ca3af"
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
          />
          <View style={styles.row}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Discount value"
              placeholderTextColor="#9ca3af"
              value={discountValue}
              onChangeText={setDiscountValue}
              keyboardType="decimal-pad"
            />
            <TouchableOpacity
              style={[styles.typeBtn, discountType === 'percent' && styles.typeBtnActive]}
              onPress={() => setDiscountType('percent')}
            >
              <ThemedText>%</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.typeBtn, discountType === 'fixed' && styles.typeBtnActive]}
              onPress={() => setDiscountType('fixed')}
            >
              <ThemedText>$</ThemedText>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[styles.createBtn, creating && styles.createBtnDisabled]}
            onPress={handleCreate}
            disabled={creating}
          >
            {creating ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <ThemedText style={styles.createBtnText}>Create Coupon</ThemedText>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.list}>
          <ThemedText style={styles.listTitle}>Your Coupons</ThemedText>
          {coupons.length === 0 ? (
            <ThemedText style={styles.empty}>No coupons yet. Create one above.</ThemedText>
          ) : (
            coupons.map((c) => (
              <View key={c.id} style={styles.couponCard}>
                <ThemedText style={styles.couponCode}>{c.code}</ThemedText>
                <ThemedText style={styles.couponDiscount}>
                  {c.discount_type === 'percent' ? `${c.discount_value}%` : `$${c.discount_value}`} off
                </ThemedText>
                {c.expires_at && (
                  <ThemedText style={styles.couponExpiry}>Expires: {new Date(c.expires_at).toLocaleDateString()}</ThemedText>
                )}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 20, paddingBottom: 40 },
  title: { marginBottom: 8 },
  subtitle: { color: '#6b7280', marginBottom: 24 },
  form: { marginBottom: 32 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
    color: '#1f2937',
  },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 12 },
  typeBtn: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  typeBtnActive: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  createBtn: {
    backgroundColor: '#3b82f6',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  createBtnDisabled: { opacity: 0.7 },
  createBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  list: {},
  listTitle: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
  empty: { color: '#9ca3af', marginBottom: 16 },
  couponCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  couponCode: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  couponDiscount: { color: '#059669', marginBottom: 4 },
  couponExpiry: { fontSize: 12, color: '#6b7280' },
});
