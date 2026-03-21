/**
 * Public SMS opt-in page for toll-free carrier / provider verification.
 * Production URL (example): https://www.merchtrader.org/sms-opt-in
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SmsOptInFields from '@/components/SmsOptInFields';
import { api } from '@/services/api';
import { buildSmsConsentCopyVersion } from '@/constants/smsConsent';

export default function SmsOptInScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const maxW = Math.min(480, width - 32);

  const [phone, setPhone] = useState('');
  const [smsConsent, setSmsConsent] = useState(false);
  const [termsConsent, setTermsConsent] = useState(false);
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!smsConsent) {
      Alert.alert('Consent Required', 'Please check the first box to consent to SMS messages.');
      return;
    }
    if (!termsConsent) {
      Alert.alert(
        'Consent Required',
        'Please check the box to agree to the Terms and Conditions and Privacy Policy.'
      );
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
        consentCopyVersion: buildSmsConsentCopyVersion(),
      });
      if (res.data?.sent) {
        Alert.alert('Sent', 'Check your phone for the message.');
      } else {
        Alert.alert('Send Failed', res.data?.error || 'Could not send.');
      }
    } catch (e: any) {
      const msg = e.response?.data?.error || e.message || 'Failed to send.';
      Alert.alert('Error', msg);
    } finally {
      setSending(false);
    }
  };

  return (
    <ScrollView
      style={[styles.root, { paddingTop: insets.top + 16 }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.card, { maxWidth: maxW }]}>
        <Text style={styles.title}>SMS opt-in</Text>
        <Text style={styles.subtitle}>
          Enter your mobile number and accept both options below, then tap SEND.
        </Text>
        <SmsOptInFields
          phone={phone}
          onPhoneChange={setPhone}
          smsConsent={smsConsent}
          onSmsConsentChange={setSmsConsent}
          termsConsent={termsConsent}
          onTermsConsentChange={setTermsConsent}
          sending={sending}
          onSend={handleSend}
          sendButtonLabel="SEND"
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  card: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#6b7280',
    marginBottom: 20,
    lineHeight: 22,
  },
});
