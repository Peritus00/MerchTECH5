import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { api } from '@/services/api';
import SmsOptInFields from '@/components/SmsOptInFields';
import {
  SMS_AFFILIATE_MARKETING_OPT_IN_TEXT,
  buildAffiliateMarketingConsentCopyVersion,
  buildSmsConsentCopyVersion,
} from '@/constants/smsConsent';

interface OpenAccessLeadGateModalProps {
  visible: boolean;
  onClose: () => void;
  onVerified: (leadId: number) => void;
  contentType: 'playlist' | 'slideshow';
  contentId: string;
  contentName?: string;
}

export default function OpenAccessLeadGateModal({
  visible,
  onClose,
  onVerified,
  contentType,
  contentId,
  contentName,
}: OpenAccessLeadGateModalProps) {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [smsConsent, setSmsConsent] = useState(false);
  const [termsConsent, setTermsConsent] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [waitingVerify, setWaitingVerify] = useState(false);
  const [pollToken, setPollToken] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!visible) {
      setFullName('');
      setPhone('');
      setSmsConsent(false);
      setTermsConsent(false);
      setMarketingConsent(false);
      setSending(false);
      setWaitingVerify(false);
      setPollToken(null);
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || !waitingVerify || !pollToken) {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }

    const tick = async () => {
      try {
        const response = await api.get('/preview-leads/status', { params: { pollToken } });
        if (response.data?.status === 'verified' && response.data?.leadId) {
          if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
          }
          setWaitingVerify(false);
          setPollToken(null);
          onVerified(Number(response.data.leadId));
        }
      } catch {
        // Keep polling while the verification SMS is pending.
      }
    };

    tick();
    pollTimerRef.current = setInterval(tick, 2000);
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [visible, waitingVerify, pollToken, onVerified]);

  const handleSend = async () => {
    if (!fullName.trim()) {
      Alert.alert('Name Required', 'Please enter your name to continue.');
      return;
    }
    if (!smsConsent) {
      Alert.alert('Consent Required', 'Please consent to receive the verification text.');
      return;
    }
    if (!termsConsent) {
      Alert.alert('Consent Required', 'Please agree to the Terms and Conditions and Privacy Policy.');
      return;
    }
    if (!marketingConsent) {
      Alert.alert(
        'Consent Required',
        'Please agree to receive marketing communications from MerchTrader, its sponsors, and affiliates to continue.'
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
      const response = await api.post('/open-access-leads/start', {
        fullName: fullName.trim(),
        phone,
        contentType,
        contentId,
        transactionalConsent: true,
        termsConsent: true,
        marketingOptIn: true,
        transactionalConsentCopyVersion: buildSmsConsentCopyVersion(),
        marketingConsentCopyVersion: buildAffiliateMarketingConsentCopyVersion(),
      });
      if (response.data?.ok && response.data?.pollToken) {
        setPollToken(String(response.data.pollToken));
        setWaitingVerify(true);
      } else {
        Alert.alert('Send Failed', response.data?.error || 'Could not send verification text.');
      }
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.error || error.message || 'Failed to send verification text.');
    } finally {
      setSending(false);
    }
  };

  const blocked = sending || waitingVerify;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>Continue to {contentName || 'content'}</Text>
          <Text style={styles.subtitle}>
            Enter your name and phone number, check all required consent boxes, then verify by text message to continue.
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Full name"
            placeholderTextColor="#9ca3af"
            value={fullName}
            onChangeText={setFullName}
            editable={!blocked}
            autoCapitalize="words"
          />

          {waitingVerify && (
            <View style={styles.waitingRow}>
              <ActivityIndicator color="#3b82f6" />
              <Text style={styles.waitingText}>Waiting for phone verification...</Text>
            </View>
          )}

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
            marketingConsentText={SMS_AFFILIATE_MARKETING_OPT_IN_TEXT}
            sending={sending}
            onSend={handleSend}
            sendButtonLabel="SEND"
            disabled={blocked}
          />

          <TouchableOpacity style={styles.closeBtn} onPress={onClose} disabled={blocked}>
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
    maxWidth: 440,
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
    marginBottom: 16,
    lineHeight: 20,
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
  waitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  waitingText: {
    fontSize: 14,
    color: '#2563eb',
    fontWeight: '600',
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
