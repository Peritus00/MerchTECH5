import React, { useState, useEffect, useMemo } from 'react';
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
import { Picker } from '@react-native-picker/picker';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { MaterialIcons } from '@expo/vector-icons';
import { couponAPI, productsAPI, playlistsAPI, slideshowsAPI } from '@/services/api';

type TargetKind = 'product' | 'playlist' | 'slideshow';

function normalizeItemMaps(c: any): { productId?: number; playlistId?: number; slideshowId?: number }[] {
  let m = c?.item_maps;
  if (typeof m === 'string') {
    try {
      m = JSON.parse(m);
    } catch {
      m = [];
    }
  }
  return Array.isArray(m) ? m : [];
}

function formatScopeSummary(c: any, playlists: any[], slideshows: any[], products: any[]): string {
  const maps = normalizeItemMaps(c);
  if (!maps.length) return 'Entire store (your products)';
  const parts: string[] = [];
  for (const m of maps) {
    const plId = m.playlistId ?? m.playlist_id;
    const slId = m.slideshowId ?? m.slideshow_id;
    const prId = m.productId ?? m.product_id;
    if (plId != null) {
      const p = playlists.find((x) => Number(x.id) === Number(plId));
      parts.push(`Playlist: ${p?.name || `#${plId}`}`);
    } else if (slId != null) {
      const s = slideshows.find((x) => Number(x.id) === Number(slId));
      parts.push(`Slideshow: ${s?.title || s?.name || `#${slId}`}`);
    } else if (prId != null) {
      const pr = products.find((x) => Number(x.id) === Number(prId));
      parts.push(`Product: ${pr?.name || `#${prId}`}`);
    }
  }
  return parts.length ? parts.join('; ') : 'Specific items';
}

export default function CouponsSettingsScreen() {
  const [coupons, setCoupons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [code, setCode] = useState('');
  const [discountValue, setDiscountValue] = useState('');
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [storeWide, setStoreWide] = useState(true);
  const [targetKind, setTargetKind] = useState<TargetKind>('playlist');
  const [selectedTargetId, setSelectedTargetId] = useState<string>('');
  const [startsDate, setStartsDate] = useState('');
  const [expiresDate, setExpiresDate] = useState('');
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [slideshows, setSlideshows] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [pl, sl, pr] = await Promise.all([
          playlistsAPI.getAll(),
          slideshowsAPI.getAll(),
          productsAPI.getMyProducts(),
        ]);
        setPlaylists(Array.isArray(pl) ? pl : []);
        setSlideshows(Array.isArray(sl) ? sl : []);
        setProducts(Array.isArray(pr) ? pr : []);
      } catch {
        setPlaylists([]);
        setSlideshows([]);
        setProducts([]);
      }
      loadCoupons();
    })();
  }, []);

  const loadCoupons = async () => {
    try {
      const data = await couponAPI.list();
      setCoupons(Array.isArray(data) ? data : []);
    } catch {
      setCoupons([]);
    } finally {
      setLoading(false);
    }
  };

  const pickerOptions = useMemo(() => {
    if (targetKind === 'playlist') {
      return playlists.map((p) => ({
        label: p.name || `Playlist #${p.id}`,
        value: String(p.id),
      }));
    }
    if (targetKind === 'slideshow') {
      return slideshows.map((s) => ({
        label: s.title || s.name || `Slideshow #${s.id}`,
        value: String(s.id),
      }));
    }
    return products.map((p) => ({
      label: p.name || `Product #${p.id}`,
      value: String(p.id),
    }));
  }, [targetKind, playlists, slideshows, products]);

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

    let itemIds: { productId?: number; playlistId?: number; slideshowId?: number }[] | undefined;
    if (!storeWide) {
      const id = parseInt(selectedTargetId, 10);
      if (!selectedTargetId || isNaN(id)) {
        Alert.alert('Select an item', 'Choose a product, playlist, or slideshow for this coupon.');
        return;
      }
      if (targetKind === 'product') itemIds = [{ productId: id }];
      else if (targetKind === 'playlist') itemIds = [{ playlistId: id }];
      else itemIds = [{ slideshowId: id }];
    }

    const startsAt =
      startsDate.trim() !== '' ? `${startsDate.trim()}T00:00:00.000Z` : undefined;
    const expiresAt =
      expiresDate.trim() !== '' ? `${expiresDate.trim()}T23:59:59.999Z` : undefined;

    setCreating(true);
    try {
      await couponAPI.create({
        code: code.trim().toUpperCase(),
        discountType,
        discountValue: val,
        startsAt,
        expiresAt,
        itemIds: storeWide ? [] : itemIds,
      });
      setCode('');
      setDiscountValue('');
      setSelectedTargetId('');
      setStartsDate('');
      setExpiresDate('');
      setStoreWide(true);
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

  const handleDelete = async (coupon: any) => {
    Alert.alert(
      'Delete Coupon',
      `Delete coupon ${coupon.code}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await couponAPI.delete(Number(coupon.id));
              await loadCoupons();
            } catch (e: any) {
              const msg = e.response?.data?.error || e.message || 'Failed to delete coupon.';
              Alert.alert('Error', msg);
            }
          },
        },
      ]
    );
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
        <ThemedText type="title" style={styles.title}>
          My Coupons
        </ThemedText>
        <ThemedText style={styles.subtitle}>
          Create discount codes for your store. Scope to one playlist, slideshow, or product—or your entire store.
        </ThemedText>

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
              <ThemedText style={discountType === 'percent' ? styles.typeBtnTextActive : undefined}>
                %
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.typeBtn, discountType === 'fixed' && styles.typeBtnActive]}
              onPress={() => setDiscountType('fixed')}
            >
              <ThemedText style={discountType === 'fixed' ? styles.typeBtnTextActive : undefined}>
                $
              </ThemedText>
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.input}
            placeholder="Begin date (YYYY-MM-DD) optional"
            placeholderTextColor="#9ca3af"
            value={startsDate}
            onChangeText={setStartsDate}
          />
          <TextInput
            style={styles.input}
            placeholder="Expiration date (YYYY-MM-DD) optional"
            placeholderTextColor="#9ca3af"
            value={expiresDate}
            onChangeText={setExpiresDate}
          />

          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setStoreWide(!storeWide)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: storeWide }}
          >
            <MaterialIcons
              name={storeWide ? 'check-box' : 'check-box-outline-blank'}
              size={24}
              color={storeWide ? '#3b82f6' : '#9ca3af'}
            />
            <ThemedText style={styles.checkboxLabel}>
              Good for everything in my store (all my products)
            </ThemedText>
          </TouchableOpacity>

          {!storeWide && (
            <>
              <ThemedText style={styles.fieldLabel}>Apply to</ThemedText>
              <View style={styles.kindRow}>
                {(['playlist', 'slideshow', 'product'] as TargetKind[]).map((k) => (
                  <TouchableOpacity
                    key={k}
                    style={[styles.kindChip, targetKind === k && styles.kindChipActive]}
                    onPress={() => {
                      setTargetKind(k);
                      setSelectedTargetId('');
                    }}
                  >
                    <ThemedText style={targetKind === k ? styles.kindChipTextActive : styles.kindChipText}>
                      {k === 'product' ? 'Product' : k === 'playlist' ? 'Playlist' : 'Slideshow'}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.pickerWrap}>
                <Picker
                  selectedValue={selectedTargetId}
                  onValueChange={(v) => setSelectedTargetId(String(v))}
                  style={styles.picker}
                  itemStyle={Platform.OS === 'ios' ? { color: '#1f2937' } : undefined}
                >
                  <Picker.Item label="— Select —" value="" color="#6b7280" />
                  {pickerOptions.map((opt) => (
                    <Picker.Item key={opt.value} label={opt.label} value={opt.value} color="#1f2937" />
                  ))}
                </Picker>
              </View>
            </>
          )}

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
                <View style={styles.couponHeader}>
                  <View style={styles.couponHeaderText}>
                    <ThemedText style={styles.couponCode}>{c.code}</ThemedText>
                    {c.isDefaultPreviewCoupon && (
                      <ThemedText style={styles.defaultBadge}>Default $5.00 coupon</ThemedText>
                    )}
                  </View>
                  {!c.isDefaultPreviewCoupon && (
                    <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(c)}>
                      <MaterialIcons name="delete-outline" size={18} color="#dc2626" />
                    </TouchableOpacity>
                  )}
                </View>
                <ThemedText style={styles.couponDiscount}>
                  {c.discount_type === 'percent' ? `${c.discount_value}%` : `$${c.discount_value}`} off
                </ThemedText>
                <ThemedText style={styles.couponScope}>
                  {formatScopeSummary(c, playlists, slideshows, products)}
                </ThemedText>
                {c.starts_at && (
                  <ThemedText style={styles.couponExpiry}>
                    Starts: {new Date(c.starts_at).toLocaleDateString()}
                  </ThemedText>
                )}
                {c.expires_at && (
                  <ThemedText style={styles.couponExpiry}>
                    Expires: {new Date(c.expires_at).toLocaleDateString()}
                  </ThemedText>
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
  typeBtnTextActive: { color: '#fff', fontWeight: '600' },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  checkboxLabel: { flex: 1, fontSize: 14, color: '#374151' },
  fieldLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8, color: '#374151' },
  kindRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  kindChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#f9fafb',
  },
  kindChipActive: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  kindChipText: { color: '#374151', fontSize: 14 },
  kindChipTextActive: { color: '#fff', fontSize: 14, fontWeight: '600' },
  pickerWrap: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    marginBottom: 16,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  picker: { width: '100%', ...(Platform.OS === 'web' ? { height: 44 } : {}) },
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
  couponHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  couponHeaderText: {
    flex: 1,
  },
  couponCode: { fontSize: 18, fontWeight: '700', marginBottom: 4, color: '#dc2626' },
  defaultBadge: { fontSize: 12, color: '#2563eb', marginBottom: 4 },
  deleteBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  couponDiscount: { color: '#059669', marginBottom: 4 },
  couponScope: { fontSize: 13, color: '#4b5563', marginBottom: 4 },
  couponExpiry: { fontSize: 12, color: '#6b7280' },
});
