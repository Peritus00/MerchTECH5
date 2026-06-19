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
import { lockedAccessAPI } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import {
  SMS_MARKETING_OPT_IN_TEXT,
  SMS_TERMS_CONSENT_SUMMARY,
  SMS_TRANSACTIONAL_CONSENT_TEXT,
  buildMarketingConsentCopyVersion,
  buildSmsConsentCopyVersion,
} from '@/constants/smsConsent';

type Props = {
  visible: boolean;
  contentType: 'playlist' | 'slideshow';
  contentId: string;
  activationCode: string;
  contentName?: string;
  onClose: () => void;
  onCompleted: (code: string) => void | Promise<void>;
};

export default function LockedAccessSignupModal({
  visible,
  contentType,
  contentId,
  activationCode,
  contentName,
  onClose,
  onCompleted,
}: Props) {
  const { acceptAuthResponse } = useAuth();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [smsConsent, setSmsConsent] = useState(false);
  const [termsConsent, setTermsConsent] = useState(false);
  const [smsMarketing, setSmsMarketing] = useState(false);
  const [emailMarketing, setEmailMarketing] = useState(false);
  const [sending, setSending] = useState(false);
  const [pollToken, setPollToken] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!visible) {
      setPollToken(null);
      setSending(false);
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || !pollToken) return;

    const tick = async () => {
      try {
        const result = await lockedAccessAPI.status(pollToken);
        if (result.status !== 'verified') return;
        if (!result.user || !result.token) {
          throw new Error('Account creation did not return a valid sign-in token.');
        }
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
        const accepted = await acceptAuthResponse({ user: result.user, token: result.token });
        if (!accepted.success) {
          throw new Error(accepted.error || 'Could not sign in to the new viewer account.');
        }
        await onCompleted(activationCode.trim());
        onClose();
      } catch (error: any) {
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
        setPollToken(null);
        setSending(false);
        Alert.alert('Account setup failed', error.response?.data?.error || error.message || 'Please try again.');
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
  }, [visible, pollToken, acceptAuthResponse, activationCode, onClose, onCompleted]);

  const validate = () => {
    if (!email.includes('@')) return 'Enter a valid email address.';
    if (username.trim().length < 3) return 'Username must be at least 3 characters.';
    if (password.length < 8) return 'Password must be at least 8 characters.';
    if (password !== confirmPassword) return 'Passwords do not match.';
    if (phone.replace(/\D/g, '').length < 10) return 'Enter a valid phone number.';
    if (!smsConsent) return 'Please consent to the verification text message.';
    if (!termsConsent) return 'Please agree to the Terms and Privacy Policy.';
    return null;
  };

  const start = async () => {
    const error = validate();
    if (error) {
      Alert.alert('Check your information', error);
      return;
    }
    setSending(true);
    try {
      const result = await lockedAccessAPI.start({
        code: activationCode.trim(),
        contentType,
        contentId,
        phone,
        email: email.trim(),
        username: username.trim(),
        password,
        transactionalConsent: true,
        termsConsent: true,
        smsMarketingOptIn: smsMarketing,
        emailMarketingOptIn: emailMarketing,
        transactionalConsentCopyVersion: buildSmsConsentCopyVersion(),
        smsMarketingConsentCopyVersion: smsMarketing ? buildMarketingConsentCopyVersion() : undefined,
        emailMarketingConsentCopyVersion: emailMarketing
          ? 'I agree to receive promotional and marketing emails from MerchTrader.'
          : undefined,
      });
      if (!result.ok || !result.pollToken) {
        throw new Error('Could not send verification text.');
      }
      setPollToken(String(result.pollToken));
    } catch (error: any) {
      setSending(false);
      Alert.alert('Verification failed', error.response?.data?.error || error.message || 'Please try again.');
    }
  };

  const waiting = !!pollToken;
  const disabled = sending || waiting;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>Create viewer account</Text>
          <Text style={styles.subtitle}>
            {waiting
              ? 'Check your text messages and tap the verification link. This screen will continue automatically.'
              : `Your code is valid${contentName ? ` for ${contentName}` : ''}. Verify your phone to save access to a viewer profile.`}
          </Text>

          {waiting ? (
            <View style={styles.waitingRow}>
              <ActivityIndicator color="#2563eb" />
              <Text style={styles.waitingText}>Waiting for phone verification...</Text>
            </View>
          ) : null}

          <TextInput style={styles.input} placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} editable={!disabled} />
          <TextInput style={styles.input} placeholder="Username" autoCapitalize="none" value={username} onChangeText={setUsername} editable={!disabled} />
          <TextInput style={styles.input} placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} editable={!disabled} />
          <TextInput style={styles.input} placeholder="Confirm password" secureTextEntry value={confirmPassword} onChangeText={setConfirmPassword} editable={!disabled} />
          <TextInput style={styles.input} placeholder="Phone number" keyboardType="phone-pad" value={phone} onChangeText={setPhone} editable={!disabled} />

          <Checkbox checked={smsConsent} onPress={() => setSmsConsent((v) => !v)} label={SMS_TRANSACTIONAL_CONSENT_TEXT} disabled={disabled} />
          <Checkbox checked={termsConsent} onPress={() => setTermsConsent((v) => !v)} label={SMS_TERMS_CONSENT_SUMMARY} disabled={disabled} />
          <Checkbox checked={smsMarketing} onPress={() => setSmsMarketing((v) => !v)} label={SMS_MARKETING_OPT_IN_TEXT} disabled={disabled} />
          <Checkbox checked={emailMarketing} onPress={() => setEmailMarketing((v) => !v)} label="I agree to receive promotional and marketing emails from MerchTrader." disabled={disabled} />

          <TouchableOpacity style={[styles.primaryButton, disabled && styles.disabled]} onPress={start} disabled={disabled}>
            {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Send verification text</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelButton} onPress={onClose} disabled={sending}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function Checkbox({ checked, onPress, label, disabled }: { checked: boolean; onPress: () => void; label: string; disabled?: boolean }) {
  return (
    <TouchableOpacity style={styles.checkboxRow} onPress={onPress} disabled={disabled} activeOpacity={0.8}>
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked ? <Text style={styles.checkmark}>x</Text> : null}
      </View>
      <Text style={styles.checkboxLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 460,
    maxHeight: '94%',
  },
  title: { fontSize: 21, fontWeight: '700', color: '#111827', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#4b5563', lineHeight: 20, marginBottom: 14 },
  waitingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  waitingText: { color: '#374151', fontSize: 14 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 10,
    fontSize: 15,
    backgroundColor: '#fff',
  },
  checkboxRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginVertical: 6 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#9ca3af',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxChecked: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  checkmark: { color: '#fff', fontWeight: '700', lineHeight: 18 },
  checkboxLabel: { flex: 1, color: '#374151', fontSize: 12, lineHeight: 17 },
  primaryButton: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 14,
  },
  primaryButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  disabled: { opacity: 0.65 },
  cancelButton: { alignItems: 'center', paddingVertical: 12 },
  cancelText: { color: '#6b7280', fontWeight: '600' },
});
