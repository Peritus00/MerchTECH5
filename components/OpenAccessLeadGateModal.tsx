import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { api, openAccessLeadsAPI } from '@/services/api';
import SmsOptInFields from '@/components/SmsOptInFields';
import {
  SMS_AFFILIATE_MARKETING_OPT_IN_TEXT,
  buildAffiliateMarketingConsentCopyVersion,
  buildSmsConsentCopyVersion,
} from '@/constants/smsConsent';
import { useAuth } from '@/contexts/AuthContext';
import { useGoogleSignIn } from '@/hooks/useGoogleSignIn';
import { useAppleSignIn } from '@/hooks/useAppleSignIn';
import { storeAuthReturnTo } from '@/utils/safeReturnTo';

type GateStep = 'account' | 'phone';

interface OpenAccessLeadGateModalProps {
  visible: boolean;
  onClose: () => void;
  onVerified: (leadId: number) => void;
  contentType: 'playlist' | 'slideshow';
  contentId: string;
  contentName?: string;
  returnTo?: string;
}

export default function OpenAccessLeadGateModal({
  visible,
  onClose,
  onVerified,
  contentType,
  contentId,
  contentName,
  returnTo,
}: OpenAccessLeadGateModalProps) {
  const router = useRouter();
  const { isAuthenticated, user } = useAuth();
  const { signIn: googleSignIn, loading: googleLoading } = useGoogleSignIn();
  const { signIn: appleSignIn, loading: appleLoading } = useAppleSignIn();

  const [step, setStep] = useState<GateStep>('account');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [smsConsent, setSmsConsent] = useState(false);
  const [termsConsent, setTermsConsent] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [waitingVerify, setWaitingVerify] = useState(false);
  const [pollToken, setPollToken] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const accessReturnTo =
    returnTo || `/${contentType === 'playlist' ? 'playlist-access' : 'slideshow-access'}/${contentId}`;

  const resetForm = useCallback(() => {
    setStep('account');
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
  }, []);

  useEffect(() => {
    if (!visible) {
      resetForm();
      return;
    }
    if (isAuthenticated) {
      setStep('phone');
      if (user?.firstName && !fullName) {
        setFullName(user.firstName);
      }
    } else {
      setStep('account');
    }
  }, [visible, isAuthenticated, user?.firstName, resetForm]);

  const finishVerified = useCallback(
    async (leadId: number) => {
      if (isAuthenticated) {
        try {
          await openAccessLeadsAPI.attach({
            contentType,
            contentId,
            leadId,
            source: 'open_access_lead',
          });
        } catch {
          // Non-blocking; local playback can still proceed.
        }
      }
      onVerified(leadId);
    },
    [contentType, contentId, isAuthenticated, onVerified]
  );

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
          await finishVerified(Number(response.data.leadId));
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
  }, [visible, waitingVerify, pollToken, finishVerified]);

  const persistReturnTo = () => {
    storeAuthReturnTo(accessReturnTo);
  };

  const handleGoogleSignIn = async () => {
    try {
      persistReturnTo();
      const result = await googleSignIn();
      if (result.success && !(result as { redirecting?: boolean }).redirecting) {
        setStep('phone');
      }
    } catch (error: any) {
      Alert.alert('Sign In Failed', error.message || 'Google sign-in failed');
    }
  };

  const handleAppleSignIn = async () => {
    try {
      persistReturnTo();
      const result = await appleSignIn();
      if (result.success && !(result as { redirecting?: boolean }).redirecting) {
        setStep('phone');
      }
    } catch (error: any) {
      Alert.alert('Sign In Failed', error.message || 'Apple sign-in failed');
    }
  };

  const handleLoginPress = () => {
    persistReturnTo();
    router.push({
      pathname: '/auth/login',
      params: { returnTo: accessReturnTo },
    });
  };

  const handleRegisterPress = () => {
    persistReturnTo();
    router.push({
      pathname: '/auth/register-viewer',
      params: { returnTo: accessReturnTo },
    });
  };

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
      const response = await openAccessLeadsAPI.start({
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
      if (response?.ok && response?.pollToken) {
        setPollToken(String(response.pollToken));
        setWaitingVerify(true);
      } else {
        Alert.alert('Send Failed', response?.error || 'Could not send verification text.');
      }
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.error || error.message || 'Failed to send verification text.');
    } finally {
      setSending(false);
    }
  };

  const blocked = sending || waitingVerify;
  const socialLoading = googleLoading || appleLoading;
  const showAppleButton =
    Platform.OS === 'ios' ||
    (Platform.OS === 'web' &&
      !!(process.env.EXPO_PUBLIC_APPLE_CLIENT_ID || process.env.EXPO_PUBLIC_APPLE_SERVICE_ID));

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.modal}>
            <Text style={styles.title}>Continue to {contentName || 'content'}</Text>

            {step === 'account' ? (
              <>
                <Text style={styles.subtitle}>
                  Create a free account or sign in so we can remember your access and stop asking for this again.
                </Text>

                <TouchableOpacity
                  style={[styles.socialButton, styles.googleButton, socialLoading && styles.btnDisabled]}
                  onPress={handleGoogleSignIn}
                  disabled={socialLoading}
                >
                  {googleLoading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.socialButtonText}>Continue with Google</Text>
                  )}
                </TouchableOpacity>

                {showAppleButton && (
                  <TouchableOpacity
                    style={[styles.socialButton, styles.appleButton, socialLoading && styles.btnDisabled]}
                    onPress={handleAppleSignIn}
                    disabled={socialLoading}
                  >
                    {appleLoading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.socialButtonText}>Continue with Apple</Text>
                    )}
                  </TouchableOpacity>
                )}

                <TouchableOpacity style={styles.primaryButton} onPress={handleRegisterPress}>
                  <Text style={styles.primaryButtonText}>Create account with email</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.linkButton} onPress={handleLoginPress}>
                  <Text style={styles.linkText}>
                    Already have an account? <Text style={styles.linkBold}>Log in</Text>
                  </Text>
                </TouchableOpacity>

                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>or</Text>
                  <View style={styles.dividerLine} />
                </View>

                <TouchableOpacity style={styles.secondaryButton} onPress={() => setStep('phone')}>
                  <Text style={styles.secondaryButtonText}>Continue with phone only</Text>
                </TouchableOpacity>
                <Text style={styles.phoneOnlyHint}>
                  Phone-only access may only be remembered on this browser or device.
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.subtitle}>
                  {isAuthenticated
                    ? 'One-time phone verification is still required. After this, your account will remember access on any device.'
                    : 'Enter your name and phone number, check all required consent boxes, then verify by text message to continue.'}
                </Text>

                {!isAuthenticated && (
                  <TouchableOpacity style={styles.backLink} onPress={() => setStep('account')} disabled={blocked}>
                    <Text style={styles.backLinkText}>Back to account options</Text>
                  </TouchableOpacity>
                )}

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
              </>
            )}

            <TouchableOpacity style={styles.closeBtn} onPress={onClose} disabled={blocked}>
              <Text style={styles.closeBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
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
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    width: '100%',
    maxWidth: 440,
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
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
  socialButton: {
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  googleButton: {
    backgroundColor: '#4285F4',
  },
  appleButton: {
    backgroundColor: '#000',
  },
  socialButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: '#3b82f6',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  secondaryButtonText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '600',
  },
  phoneOnlyHint: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 18,
  },
  linkButton: {
    alignItems: 'center',
    marginBottom: 16,
  },
  linkText: {
    fontSize: 14,
    color: '#6b7280',
  },
  linkBold: {
    color: '#2563eb',
    fontWeight: '600',
  },
  backLink: {
    marginBottom: 12,
  },
  backLinkText: {
    fontSize: 14,
    color: '#2563eb',
    fontWeight: '600',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e5e7eb',
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 14,
    color: '#9ca3af',
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
  btnDisabled: {
    opacity: 0.6,
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
