import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { lockedAccessAPI } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { normalizeApiError } from '@/utils/formErrors';
import {
  SMS_MARKETING_OPT_IN_TEXT,
  SMS_TERMS_CONSENT_SUMMARY,
  SMS_TRANSACTIONAL_CONSENT_TEXT,
  buildMarketingConsentCopyVersion,
  buildSmsConsentCopyVersion,
} from '@/constants/smsConsent';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Props = {
  visible: boolean;
  contentType: 'playlist' | 'slideshow';
  contentId: string;
  activationCode: string;
  contentName?: string;
  onClose: () => void;
  onCompleted: (code: string) => void | Promise<void>;
};

type FormErrors = {
  email?: string;
  username?: string;
  password?: string;
  confirmPassword?: string;
  phone?: string;
  smsConsent?: string;
  termsConsent?: string;
  general?: string;
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
  const [errors, setErrors] = useState<FormErrors>({});
  const [sending, setSending] = useState(false);
  const [pollToken, setPollToken] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingTickRef = useRef(false);
  const completedRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      setPollToken(null);
      setSending(false);
      setErrors({});
      pollingTickRef.current = false;
      completedRef.current = false;
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || !pollToken) return;

    const tick = async () => {
      if (pollingTickRef.current || completedRef.current) {
        return;
      }
      pollingTickRef.current = true;

      try {
        const result = await lockedAccessAPI.status(pollToken);
        if (result.status !== 'verified') return;
        if (!result.user || !result.token) {
          throw new Error('Account creation did not return a valid sign-in token.');
        }
        completedRef.current = true;
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
        const accepted = await acceptAuthResponse({ user: result.user, token: result.token });
        if (!accepted.success) {
          throw new Error(accepted.error || 'Could not sign in to the new viewer account.');
        }
        if (result.contentType === 'playlist' && result.contentId != null && result.playbackToken) {
          await AsyncStorage.setItem(`playlist_playback_token_${result.contentId}`, result.playbackToken);
        }
        await onCompleted(activationCode.trim());
        onClose();
      } catch (error: any) {
        completedRef.current = false;
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
        setPollToken(null);
        setSending(false);
        const normalized = normalizeApiError(error, 'Account setup failed. Please check your information and try again.');
        setErrors({ ...normalized.fields, general: normalized.message });
      } finally {
        pollingTickRef.current = false;
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

  const clearError = (field: keyof FormErrors) => {
    setErrors((prev) => ({ ...prev, [field]: undefined, general: field === 'general' ? undefined : prev.general }));
  };

  const validate = () => {
    const next: FormErrors = {};
    if (!email.trim()) {
      next.email = 'Email is required.';
    } else if (!email.includes('@')) {
      next.email = 'Enter a valid email address.';
    }
    if (!username.trim()) {
      next.username = 'Username is required.';
    } else if (username.trim().length < 3) {
      next.username = 'Username must be at least 3 characters.';
    }
    if (!password) {
      next.password = 'Password is required.';
    } else if (password.length < 8) {
      next.password = 'Password must be at least 8 characters.';
    } else if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
      next.password = 'Password must include uppercase, lowercase, and a number.';
    }
    if (!confirmPassword) {
      next.confirmPassword = 'Confirm your password.';
    } else if (password !== confirmPassword) {
      next.confirmPassword = 'Passwords do not match. Re-enter the same password in both fields.';
    }
    if (phone.replace(/\D/g, '').length < 10) {
      next.phone = 'Enter a valid 10-digit phone number.';
    }
    if (!smsConsent) {
      next.smsConsent = 'Check this box so we can send the verification text.';
    }
    if (!termsConsent) {
      next.termsConsent = 'Check this box to agree to the Terms and Privacy Policy.';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const start = async () => {
    if (!validate()) {
      return;
    }
    setSending(true);
    setErrors({});
    completedRef.current = false;
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
      const normalized = normalizeApiError(error, 'Verification failed. Please check your information and try again.');
      setErrors({ ...normalized.fields, general: normalized.message });
    }
  };

  const waiting = !!pollToken;
  const disabled = sending || waiting;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <ScrollView style={styles.modal} contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
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

          {errors.general ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{errors.general}</Text>
            </View>
          ) : null}

          <TextInput style={[styles.input, errors.email && styles.inputError]} placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={(value) => { setEmail(value); clearError('email'); }} editable={!disabled} />
          {errors.email ? <Text style={styles.fieldError}>{errors.email}</Text> : null}
          <TextInput style={[styles.input, errors.username && styles.inputError]} placeholder="Username" autoCapitalize="none" value={username} onChangeText={(value) => { setUsername(value); clearError('username'); }} editable={!disabled} />
          {errors.username ? <Text style={styles.fieldError}>{errors.username}</Text> : null}
          <TextInput style={[styles.input, errors.password && styles.inputError]} placeholder="Password" secureTextEntry value={password} onChangeText={(value) => { setPassword(value); clearError('password'); }} editable={!disabled} />
          {errors.password ? <Text style={styles.fieldError}>{errors.password}</Text> : null}
          <TextInput style={[styles.input, errors.confirmPassword && styles.inputError]} placeholder="Confirm password" secureTextEntry value={confirmPassword} onChangeText={(value) => { setConfirmPassword(value); clearError('confirmPassword'); }} editable={!disabled} />
          {errors.confirmPassword ? <Text style={styles.fieldError}>{errors.confirmPassword}</Text> : null}
          <TextInput style={[styles.input, errors.phone && styles.inputError]} placeholder="Phone number" keyboardType="phone-pad" value={phone} onChangeText={(value) => { setPhone(value); clearError('phone'); }} editable={!disabled} />
          {errors.phone ? <Text style={styles.fieldError}>{errors.phone}</Text> : null}

          <Checkbox checked={smsConsent} onPress={() => { setSmsConsent((v) => !v); clearError('smsConsent'); }} label={SMS_TRANSACTIONAL_CONSENT_TEXT} disabled={disabled} />
          {errors.smsConsent ? <Text style={styles.fieldError}>{errors.smsConsent}</Text> : null}
          <Checkbox checked={termsConsent} onPress={() => { setTermsConsent((v) => !v); clearError('termsConsent'); }} label={SMS_TERMS_CONSENT_SUMMARY} disabled={disabled} />
          {errors.termsConsent ? <Text style={styles.fieldError}>{errors.termsConsent}</Text> : null}
          <Checkbox checked={smsMarketing} onPress={() => setSmsMarketing((v) => !v)} label={SMS_MARKETING_OPT_IN_TEXT} disabled={disabled} />
          <Checkbox checked={emailMarketing} onPress={() => setEmailMarketing((v) => !v)} label="I agree to receive promotional and marketing emails from MerchTrader." disabled={disabled} />

          <TouchableOpacity style={[styles.primaryButton, disabled && styles.disabled]} onPress={start} disabled={disabled}>
            {sending ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Send verification text</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelButton} onPress={onClose} disabled={sending}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </ScrollView>
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
    width: '100%',
    maxWidth: 460,
    maxHeight: '94%',
  },
  modalContent: { padding: 20 },
  title: { fontSize: 21, fontWeight: '700', color: '#111827', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#4b5563', lineHeight: 20, marginBottom: 14 },
  waitingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  waitingText: { color: '#374151', fontSize: 14 },
  errorBanner: {
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorBannerText: { color: '#b91c1c', fontSize: 13, lineHeight: 18 },
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
  inputError: { borderColor: '#ef4444' },
  fieldError: { color: '#dc2626', fontSize: 12, marginTop: -6, marginBottom: 8, lineHeight: 16 },
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
