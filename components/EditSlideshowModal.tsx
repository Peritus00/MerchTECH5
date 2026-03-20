import React, { useState, useEffect } from 'react';
import { View, Text, Modal, TextInput, TouchableOpacity, StyleSheet, ScrollView, Switch, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { MaterialIcons } from '@expo/vector-icons';
import { couponAPI } from '@/services/api';

interface Slideshow {
  id: number;
  name: string;
  description?: string;
  autoplayInterval: number;
  transition: string;
  requiresActivationCode: boolean;
  previewCouponId?: number | null;
}

interface Props {
  visible: boolean;
  slideshow: Slideshow | null;
  onClose: () => void;
  onSave: (updates: Partial<Slideshow>) => void;
}

const EditSlideshowModal: React.FC<Props> = ({ visible, slideshow, onClose, onSave }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [autoplayInterval, setAutoplayInterval] = useState(5000);
  const [transition, setTransition] = useState('fade');
  const [requiresActivationCode, setRequiresActivationCode] = useState(false);
  const [previewCouponId, setPreviewCouponId] = useState('');
  const [coupons, setCoupons] = useState<any[]>([]);

  const getDefaultCouponId = (rows: any[]) => {
    const defaultCoupon = rows.find((row) => row?.isDefaultPreviewCoupon);
    return defaultCoupon?.id != null ? String(defaultCoupon.id) : '';
  };

  useEffect(() => {
    if (slideshow) {
      console.log('🔄 EditSlideshowModal: Loading slideshow data:', {
        id: slideshow.id,
        name: slideshow.name,
        requiresActivationCode: slideshow.requiresActivationCode,
        autoplayInterval: slideshow.autoplayInterval,
        transition: slideshow.transition
      });
      
      setName(slideshow.name);
      setDescription(slideshow.description || '');
      setAutoplayInterval(slideshow.autoplayInterval);
      setTransition(slideshow.transition);
      setRequiresActivationCode(slideshow.requiresActivationCode);
      setPreviewCouponId(slideshow.previewCouponId != null ? String(slideshow.previewCouponId) : '');
      
      console.log('🔄 EditSlideshowModal: State set to:', {
        name: slideshow.name,
        requiresActivationCode: slideshow.requiresActivationCode,
        autoplayInterval: slideshow.autoplayInterval,
        transition: slideshow.transition
      });
    }
  }, [slideshow]);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    couponAPI.list()
      .then((rows) => {
        if (active) {
          const nextCoupons = Array.isArray(rows) ? rows : [];
          setCoupons(nextCoupons);
          setPreviewCouponId((prev) => prev || getDefaultCouponId(nextCoupons));
        }
      })
      .catch(() => {
        if (active) setCoupons([]);
      });
    return () => {
      active = false;
    };
  }, [visible]);

  const intervalOptions = [
    { value: 2000, label: '2s' },
    { value: 3000, label: '3s' },
    { value: 5000, label: '5s' },
    { value: 8000, label: '8s' },
    { value: 10000, label: '10s' },
  ];

  const transitionOptions = [
    { value: 'fade', label: 'Fade' },
    { value: 'slide', label: 'Slide' },
    { value: 'zoom', label: 'Zoom' },
    { value: 'none', label: 'None' },
  ];

  const handleSave = () => {
    if (!slideshow) return;
    if (!name.trim()) {
      Alert.alert('Validation', 'Name is required');
      return;
    }
    onSave({
      name: name.trim(),
      description: description.trim(),
      autoplayInterval,
      transition,
      requiresActivationCode,
      previewCouponId: previewCouponId ? Number(previewCouponId) : null,
    });
  };

  if (!slideshow) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <MaterialIcons name="close" size={24} color="#1f2937" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Slideshow</Text>
          <TouchableOpacity onPress={handleSave}>
            <Text style={styles.saveText}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
          {/* Name */}
          <Text style={styles.label}>Name</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} />

          {/* Description */}
          <Text style={styles.label}>Description</Text>
          <TextInput style={[styles.input, styles.textArea]} multiline numberOfLines={3} value={description} onChangeText={setDescription} />

          {/* Interval */}
          <Text style={styles.label}>Slide Duration</Text>
          <View style={styles.optionsRow}>
            {intervalOptions.map(opt => (
              <TouchableOpacity key={opt.value} style={[styles.optBtn, autoplayInterval === opt.value && styles.optSelected]} onPress={() => setAutoplayInterval(opt.value)}>
                <Text style={[styles.optTxt, autoplayInterval === opt.value && styles.optTxtSel]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Transition */}
          <Text style={styles.label}>Transition</Text>
          <View style={styles.optionsRow}>
            {transitionOptions.map(opt => (
              <TouchableOpacity key={opt.value} style={[styles.optBtn, transition === opt.value && styles.optSelected]} onPress={() => setTransition(opt.value)}>
                <Text style={[styles.optTxt, transition === opt.value && styles.optTxtSel]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Access code */}
          <View style={styles.switchRow}>
            <Text style={styles.label}>Require Access Code</Text>
            <Switch value={requiresActivationCode} onValueChange={(v)=>{console.log('🛡️ Edit modal require code toggle:',v); setRequiresActivationCode(v);} } />
          </View>

          <Text style={styles.label}>Preview Coupon</Text>
          <View style={styles.pickerWrap}>
            <Picker
              selectedValue={previewCouponId}
              onValueChange={(value) => setPreviewCouponId(String(value))}
              style={styles.picker}
            >
              <Picker.Item label="None" value="" />
              {coupons.map((coupon) => (
                <Picker.Item
                  key={coupon.id}
                  label={`${coupon.code} (${coupon.discount_type === 'percent' ? `${coupon.discount_value}%` : `$${coupon.discount_value}`} off)${coupon.isDefaultPreviewCoupon ? ' - Default' : ''}`}
                  value={String(coupon.id)}
                />
              ))}
            </Picker>
          </View>
          <Text style={styles.helperText}>
            This coupon will be texted when someone enters a phone number before preview.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderColor: '#e5e7eb' },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  saveText: { fontSize: 16, fontWeight: '600', color: '#3b82f6' },
  content: { flex: 1, padding: 16 },
  label: { fontSize: 14, fontWeight: '600', marginTop: 16 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 12 },
  textArea: { height: 80, textAlignVertical: 'top' },
  pickerWrap: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, overflow: 'hidden', backgroundColor: '#fff', marginTop: 8 },
  picker: { width: '100%' },
  helperText: { fontSize: 12, color: '#6b7280', marginTop: 6 },
  optionsRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  optBtn: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8, marginBottom: 8 },
  optSelected: { backgroundColor: '#eff6ff', borderColor: '#3b82f6' },
  optTxt: { fontSize: 14, color: '#6b7280' },
  optTxtSel: { color: '#3b82f6' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24 },
});

export default EditSlideshowModal; 