import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { api } from '@/services/api';

const CONSENT_COPY = 'I agree to receive marketing texts including coupons and offers.';

interface PreviewGateModalProps {
  visible: boolean;
  onClose: () => void;
  onStartPreview: () => void;
  contentType: 'playlist' | 'slideshow';
  contentId: string;
  contentName?: string;
  couponId?: number;
  /** Content owner userId - used to resolve per-user preview gate setting */
  ownerId?: number;
  /** Per-playlist/slideshow: when true, phone+consent required before preview (no skip) */
  requirePhoneForPreview?: boolean;
}

export default function PreviewGateModal({
  visible,
  onClose,
  onStartPreview,
  contentType,
  contentId,
  contentName,
  couponId,
  ownerId,
  requirePhoneForPreview = false,
}: PreviewGateModalProps) {
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [skipAllowed, setSkipAllowed] = useState(true);
  const [smsConfigured, setSmsConfigured] = useState(false);

  useEffect(() => {
    if (visible) {
      if (requirePhoneForPreview) {
        setSkipAllowed(false);
        setSmsConfigured(true);
        return;
      }
      const params = ownerId != null ? { ownerId } : {};
      api.get('/coupons/preview-gate-settings', { params }).then((r) => {
        setSkipAllowed(r.data?.skipAllowed !== false);
        setSmsConfigured(r.data?.smsConfigured === true);
      }).catch(() => {
        setSkipAllowed(true);
        setSmsConfigured(false);
      });
    }
  }, [visible, ownerId, requirePhoneForPreview]);

  const handleSendCoupon = async () => {
    if (!consent) {
      Alert.alert('Consent Required', 'Please check the box to agree to receive marketing texts.');
      return;
    }
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) {
      Alert.alert('Invalid Phone', 'Please enter a valid phone number.');
      return;
    }
    setSending(true);
    try {
      const res = await api.post('/coupons/sms/send', {
        phone,
        consent: true,
        couponId: couponId || undefined,
        consentCopyVersion: CONSENT_COPY,
      });
      if (res.data?.sent) {
        onClose();
        onStartPreview();
      } else {
        Alert.alert('Send Failed', res.data?.error || 'Could not send coupon.');
      }
    } catch (e: any) {
      const msg = e.response?.data?.error || e.message || 'Failed to send coupon.';
      Alert.alert('Error', msg);
    } finally {
      setSending(false);
    }
  };

  const handleSkip = () => {
    if (skipAllowed) {
      onClose();
      onStartPreview();
    } else {
      Alert.alert('Preview', 'Enter your phone and agree to receive a coupon to start the preview.');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>
            {requirePhoneForPreview ? 'Phone Required for Preview' : 'Get a Coupon'}
          </Text>
          <Text style={styles.subtitle}>
            {requirePhoneForPreview
              ? 'Enter your phone number and agree to receive marketing texts to start the preview.'
              : 'Enter your phone number to receive a discount coupon via text, or skip to start the preview.'}
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Phone number"
            placeholderTextColor="#9ca3af"
            value={phone}
            onChangeText={setPhone}
            keyboardType={Platform.OS === 'web' ? 'tel' : 'phone-pad'}
            editable={!sending}
          />

          <TouchableOpacity
            style={[styles.checkbox, consent && styles.checkboxChecked]}
            onPress={() => setConsent(!consent)}
            disabled={sending}
          >
            <MaterialIcons
              name={consent ? 'check-box' : 'check-box-outline-blank'}
              size={24}
              color={consent ? '#3b82f6' : '#9ca3af'}
            />
            <Text style={styles.checkboxLabel}>{CONSENT_COPY}</Text>
          </TouchableOpacity>

          <View style={styles.buttons}>
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary]}
              onPress={handleSendCoupon}
              disabled={sending}
            >
              {sending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.btnPrimaryText}>
                  {requirePhoneForPreview ? 'Continue to Preview' : 'Send Coupon Now'}
                </Text>
              )}
            </TouchableOpacity>

            {skipAllowed && (
              <TouchableOpacity
                style={[styles.btn, styles.btnSecondary]}
                onPress={handleSkip}
                disabled={sending}
              >
                <Text style={styles.btnSecondaryText}>Skip</Text>
              </TouchableOpacity>
            )}
          </View>

          {!smsConfigured && (
            <Text style={styles.hint}>SMS delivery may not be configured. You can still skip to preview.</Text>
          )}

          <TouchableOpacity style={styles.closeBtn} onPress={onClose} disabled={sending}>
            <Text style={styles.closeBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
    color: '#1f2937',
  },
  checkbox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  checkboxChecked: {},
  checkboxLabel: {
    fontSize: 14,
    color: '#374151',
    marginLeft: 8,
    flex: 1,
  },
  buttons: {
    gap: 12,
  },
  btn: {
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnPrimary: {
    backgroundColor: '#3b82f6',
  },
  btnPrimaryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  btnSecondary: {
    backgroundColor: '#f3f4f6',
  },
  btnSecondaryText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '600',
  },
  hint: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 12,
    textAlign: 'center',
  },
  closeBtn: {
    marginTop: 16,
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#6b7280',
    fontSize: 14,
  },
});
