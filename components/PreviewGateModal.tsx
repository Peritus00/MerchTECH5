import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { api } from '@/services/api';
import SmsOptInFields from '@/components/SmsOptInFields';
import { buildSmsConsentCopyVersion } from '@/constants/smsConsent';

const DEFAULT_COUPON_TITLE = 'Get a Coupon';

type PreviewCouponDisplay = {
  discountType?: string | null;
  discountValue?: number | null;
};

function formatPreviewCouponOffer(couponDisplay: PreviewCouponDisplay | null) {
  const discountType = couponDisplay?.discountType;
  const discountValue = Number(couponDisplay?.discountValue);

  if (!discountType || !Number.isFinite(discountValue) || discountValue <= 0) {
    return null;
  }

  if (discountType === 'percent') {
    return {
      headline: `GET ${discountValue}% OFF!`,
      label: `${discountValue}% off`,
    };
  }

  const dollars =
    Number.isInteger(discountValue) ? String(discountValue) : discountValue.toFixed(2);

  return {
    headline: `GET ${dollars} DOLLARS OFF!`,
    label: `${dollars} dollars off`,
  };
}

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
  const [smsConsent, setSmsConsent] = useState(false);
  const [termsConsent, setTermsConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [skipAllowed, setSkipAllowed] = useState(true);
  const [smsConfigured, setSmsConfigured] = useState(false);
  const [couponDisplay, setCouponDisplay] = useState<PreviewCouponDisplay | null>(null);

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

  useEffect(() => {
    if (!visible || requirePhoneForPreview) {
      setCouponDisplay(null);
      return;
    }

    let cancelled = false;

    api.get('/coupons/preview-display', {
      params: {
        couponId,
        contentType,
        contentId,
      },
    }).then((response) => {
      if (cancelled) return;
      setCouponDisplay(response.data?.coupon ?? null);
    }).catch(() => {
      if (cancelled) return;
      setCouponDisplay(null);
    });

    return () => {
      cancelled = true;
    };
  }, [visible, requirePhoneForPreview, couponId, contentType, contentId]);

  const couponOffer = React.useMemo(
    () => formatPreviewCouponOffer(couponDisplay),
    [couponDisplay]
  );

  const titleText = requirePhoneForPreview
    ? 'Phone Required for Preview'
    : couponOffer?.headline || DEFAULT_COUPON_TITLE;

  const subtitleText = requirePhoneForPreview
    ? 'Enter your phone number, accept both consent checkboxes, and tap SEND to start the preview.'
    : couponOffer?.label
      ? `Enter your phone number to receive ${couponOffer.label} via text (tap SEND), or skip to start the preview.`
      : 'Enter your phone number to receive a discount coupon via text (tap SEND), or skip to start the preview.';

  const handleSendCoupon = async () => {
    if (!smsConsent) {
      Alert.alert('Consent Required', 'Please check the first box to consent to SMS messages.');
      return;
    }
    if (!termsConsent) {
      Alert.alert('Consent Required', 'Please check the box to agree to the Terms and Conditions and Privacy Policy.');
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
        termsConsent: true,
        couponId: couponId || undefined,
        contentType,
        contentId,
        consentCopyVersion: buildSmsConsentCopyVersion(),
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
      Alert.alert(
        'Preview',
        'Enter your phone, accept both consent checkboxes, and tap SEND to start the preview.'
      );
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>
            {titleText}
          </Text>
          <Text style={styles.subtitle}>
            {subtitleText}
          </Text>

          <SmsOptInFields
            phone={phone}
            onPhoneChange={setPhone}
            smsConsent={smsConsent}
            onSmsConsentChange={setSmsConsent}
            termsConsent={termsConsent}
            onTermsConsentChange={setTermsConsent}
            sending={sending}
            onSend={handleSendCoupon}
            sendButtonLabel="SEND"
          />

          <View style={styles.buttons}>
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
  buttons: {
    gap: 12,
    marginTop: 4,
  },
  btn: {
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
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
