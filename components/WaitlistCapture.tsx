import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import SmsOptInFields from '@/components/SmsOptInFields';
import { waitlistAPI } from '@/services/api';
import { trackMetaLead } from '@/utils/metaPixel';
import { SMS_MARKETING_OPT_IN_TEXT } from '@/constants/smsConsent';

interface WaitlistCaptureProps {
  playlistId: string;
  batchLabel?: string;
}

export default function WaitlistCapture({
  playlistId,
  batchLabel = 'Batch 001',
}: WaitlistCaptureProps) {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [smsConsent, setSmsConsent] = useState(false);
  const [termsConsent, setTermsConsent] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showPhoneField, setShowPhoneField] = useState(false);

  const phoneDigits = phone.replace(/\D/g, '');
  const wantsPhone = showPhoneField || phoneDigits.length > 0;

  const canSubmit = useMemo(() => {
    const hasEmail = email.trim().length > 0 && email.includes('@');
    const hasValidPhone = phoneDigits.length >= 10;
    if (!hasEmail && !hasValidPhone) {
      return false;
    }
    if (wantsPhone && (!hasValidPhone || !smsConsent || !termsConsent)) {
      return false;
    }
    if (hasEmail && !wantsPhone && !termsConsent) {
      return false;
    }
    return true;
  }, [email, phoneDigits, wantsPhone, smsConsent, termsConsent]);

  const handleSubmit = async () => {
    if (!canSubmit || sending) {
      return;
    }

    setSending(true);
    try {
      const result = await waitlistAPI.subscribe({
        email: email.trim() || undefined,
        phone: wantsPhone ? phone : undefined,
        playlistId,
        source: 'splash',
        marketingConsent: wantsPhone ? marketingConsent : undefined,
      });

      const eventId = result?.eventId as string | undefined;
      trackMetaLead(eventId);
      setSubmitted(true);
    } catch (error: any) {
      const message =
        error?.response?.data?.error || error?.message || 'Could not join the waitlist. Please try again.';
      if (Platform.OS === 'web') {
        Alert.alert('Waitlist', message);
      } else {
        Alert.alert('Waitlist', message);
      }
    } finally {
      setSending(false);
    }
  };

  if (submitted) {
    return (
      <View style={styles.card}>
        <MaterialIcons name="check-circle" size={28} color="#22c55e" style={styles.successIcon} />
        <Text style={styles.successTitle}>You&apos;re on the list</Text>
        <Text style={styles.successBody}>We&apos;ll reach out when the next drop is ready.</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Not ready for {batchLabel}?</Text>
      <Text style={styles.subheading}>Join the waitlist for the next drop.</Text>

      <TextInput
        style={styles.input}
        placeholder="Email address"
        placeholderTextColor="#9ca3af"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!sending}
      />

      {!wantsPhone ? (
        <>
          <TouchableOpacity
            style={[styles.checkboxRow, termsConsent && styles.checkboxChecked]}
            onPress={() => setTermsConsent(!termsConsent)}
            disabled={sending}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: termsConsent }}
          >
            <MaterialIcons
              name={termsConsent ? 'check-box' : 'check-box-outline-blank'}
              size={22}
              color={termsConsent ? '#60a5fa' : '#9ca3af'}
            />
            <Text style={styles.checkboxLabel}>
              I agree to receive email updates about future drops from MerchTrader.
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => setShowPhoneField(true)}
            disabled={sending}
          >
            <Text style={styles.linkText}>Add phone for SMS updates</Text>
          </TouchableOpacity>
        </>
      ) : (
        <SmsOptInFields
          phone={phone}
          onPhoneChange={setPhone}
          smsConsent={smsConsent}
          onSmsConsentChange={setSmsConsent}
          termsConsent={termsConsent}
          onTermsConsentChange={setTermsConsent}
          showMarketingOptIn
          marketingConsent={marketingConsent}
          onMarketingConsentChange={setMarketingConsent}
          marketingConsentText={SMS_MARKETING_OPT_IN_TEXT}
          sending={sending}
          onSend={handleSubmit}
          sendButtonLabel="Join waitlist"
          disabled={!canSubmit}
        />
      )}

      {!wantsPhone ? (
        <TouchableOpacity
          style={[styles.primaryBtn, (!canSubmit || sending) && styles.btnDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit || sending}
        >
          {sending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.primaryBtnText}>Join waitlist</Text>
          )}
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(17, 24, 39, 0.94)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: 16,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  heading: {
    color: '#f9fafb',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  subheading: {
    color: '#d1d5db',
    fontSize: 14,
    marginBottom: 14,
    lineHeight: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
    color: '#f9fafb',
    backgroundColor: '#111827',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 12,
  },
  checkboxChecked: {},
  checkboxLabel: {
    flex: 1,
    color: '#e5e7eb',
    fontSize: 13,
    lineHeight: 18,
  },
  linkRow: {
    marginBottom: 12,
  },
  linkText: {
    color: '#60a5fa',
    fontSize: 14,
    fontWeight: '600',
  },
  primaryBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnDisabled: {
    opacity: 0.55,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  successIcon: {
    alignSelf: 'center',
    marginBottom: 8,
  },
  successTitle: {
    color: '#f9fafb',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  successBody: {
    color: '#d1d5db',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
