import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Text,
  ScrollView,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/contexts/AuthContext';
import { MaterialIconWithFallback } from '@/components/MaterialIconWithFallback';
import { MerchTechLogo } from '@/components/MerchTechLogo';
import { useGoogleSignIn } from '@/hooks/useGoogleSignIn';
import { useAppleSignIn } from '@/hooks/useAppleSignIn';
import { hasPendingShareResume, clearPendingShareResume } from '@/services/webShareTarget';

interface FormErrors {
  email?: string;
  password?: string;
  general?: string;
}

// Performance monitoring - remove in production if not needed
const DEBUG_RENDERS = __DEV__;

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showBusinessInquiriesModal, setShowBusinessInquiriesModal] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);

  const { login, isLoading } = useAuth();
  const router = useRouter();
  const { signIn: googleSignIn, loading: googleLoading } = useGoogleSignIn();
  const { signIn: appleSignIn, loading: appleLoading } = useAppleSignIn();

  // Performance monitoring
  useEffect(() => {
    if (DEBUG_RENDERS) {
      console.log('🔄 LoginScreen render:', {
        isLoading,
        isSubmitting,
        hasErrors: Object.keys(errors).length > 0,
        emailLength: email.length,
      });
    }
  }, [isLoading, isSubmitting, errors, email]);

  const validateForm = useCallback((): boolean => {
    const newErrors: FormErrors = {};

    if (!email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!email.includes('@')) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!password.trim()) {
      newErrors.password = 'Password is required';
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [email, password]);

  const handleLogin = useCallback(async () => {
    console.log('🚀 Login Screen: handleLogin called');
    console.log('🚀 Email:', email);
    console.log('🚀 Password length:', password.length);
    
    if (!validateForm()) {
      console.log('❌ Login Screen: Form validation failed');
      return;
    }

    console.log('✅ Login Screen: Form validation passed');
    setIsSubmitting(true);
    setErrors({});

    try {
      console.log('🔄 Login Screen: Calling auth context login...');
      await login(email.trim(), password);
      console.log('✅ Login Screen: Login successful, navigating to tabs');
      if (Platform.OS === 'web' && hasPendingShareResume()) {
        clearPendingShareResume();
        router.replace('/handle-share');
      } else {
        router.replace('/(tabs)');
      }
    } catch (error: any) {
      console.error('❌ Login Screen: Login error caught:', error);
      console.error('❌ Error message:', error.message);
      console.error('❌ Error status:', error.response?.status || error.status);
      console.error('❌ Error data:', error.response?.data);
      console.error('❌ Error stack:', error.stack);

      if (error.message.includes('Account suspended')) {
        Alert.alert(
          'Account Suspended',
          'Your account has been temporarily suspended due to unverified email. Please contact help@merchtrader.org for assistance.',
          [
            { text: 'Contact Support', onPress: () => {} },
            { text: 'OK', style: 'cancel' }
          ]
        );
      } else {
        // Show user-friendly error message
        const errorMessage = error.message || 'Login failed. Please check your credentials.';
        setErrors({ general: errorMessage });
      }
    } finally {
      console.log('🔄 Login Screen: Setting isSubmitting to false');
      setIsSubmitting(false);
    }
  }, [email, password, validateForm, login, router]);

  const handleForgotPassword = useCallback(() => {
    router.push('/auth/forgot-password');
  }, [router]);

  const handleEmailChange = useCallback((text: string) => {
    setEmail(text);
    if (errors.email) {
      setErrors(prev => ({ ...prev, email: undefined }));
    }
  }, [errors.email]);

  const handlePasswordChange = useCallback((text: string) => {
    setPassword(text);
    if (errors.password) {
      setErrors(prev => ({ ...prev, password: undefined }));
    }
  }, [errors.password]);

  const togglePasswordVisibility = useCallback(() => {
    setIsPasswordVisible(prev => !prev);
  }, []);

  const handleRegisterPress = useCallback(() => {
    router.push('/auth/register');
  }, [router]);

  const handleGoogleSignIn = useCallback(async () => {
    console.log('🔄 Login Screen: Google sign-in button clicked');
    try {
      const result = await googleSignIn();
      console.log('🔄 Login Screen: Google sign-in result:', result);
      if (result.success) {
        console.log('✅ Login Screen: Google sign-in successful, navigating to tabs');
        if (Platform.OS === 'web' && hasPendingShareResume()) {
          clearPendingShareResume();
          router.replace('/handle-share');
        } else {
          router.replace('/(tabs)');
        }
      } else {
        console.error('❌ Login Screen: Google sign-in failed:', result.error);
        Alert.alert('Sign In Failed', result.error || 'Google sign-in failed');
      }
    } catch (error: any) {
      console.error('❌ Login Screen: Google sign-in error:', error);
      Alert.alert('Sign In Failed', error.message || 'Google sign-in failed');
    }
  }, [googleSignIn, router]);

  const handleAppleSignIn = useCallback(async () => {
    console.log('🍎 Apple Sign-In button clicked');
    try {
      console.log('🍎 Calling appleSignIn()...');
      const result = await appleSignIn();
      console.log('🍎 Apple Sign-In result:', result);
      if (result.success) {
        // Check if we're redirecting (web OAuth flow)
        if ((result as any).redirecting) {
          console.log('🔄 Redirecting to Apple Sign-In (this is expected)');
          // The redirect happens immediately via window.location.href
          // No need to do anything else - browser will navigate away
          return;
        }
        console.log('✅ Apple Sign-In successful, navigating to tabs');
        if (Platform.OS === 'web' && hasPendingShareResume()) {
          clearPendingShareResume();
          router.replace('/handle-share');
        } else {
          router.replace('/(tabs)');
        }
      } else {
        console.error('❌ Apple Sign-In failed:', result.error);
        const errorMessage = result.error || 'Apple sign-in failed';
        if (Platform.OS === 'web') {
          window.alert(`Sign In Failed: ${errorMessage}`);
        } else {
          Alert.alert('Sign In Failed', errorMessage);
        }
      }
    } catch (error: any) {
      console.error('❌ Apple Sign-In error caught:', error);
      console.error('❌ Error details:', {
        message: error.message,
        stack: error.stack,
        error: error
      });
      const errorMessage = error.message || 'Apple sign-in failed';
      if (Platform.OS === 'web') {
        window.alert(`Sign In Failed: ${errorMessage}`);
      } else {
        Alert.alert('Sign In Failed', errorMessage);
      }
    }
  }, [appleSignIn, router]);

  // Memoize computed values to prevent unnecessary re-renders
  const loading = useMemo(() => isLoading || isSubmitting, [isLoading, isSubmitting]);
  
  // Memoize keyboard behavior for Android to prevent layout shifts
  const keyboardBehavior = useMemo(() => {
    // On Android, use 'padding' instead of 'height' to reduce flickering
    // 'height' can cause layout recalculations that lead to flickering
    // But we need to be careful not to break keyboard functionality
    return Platform.OS === 'ios' ? 'padding' : undefined;
  }, []);

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={keyboardBehavior}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      enabled={Platform.OS === 'ios'}
    >
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        // Removed removeClippedSubviews - it can cause TextInput focus issues
        // Removed bounces={false} - can interfere with keyboard behavior
      >
        <ThemedView style={styles.content}>
          <View style={styles.header}>
            <MerchTechLogo size="large" variant="full" style={styles.logo} />
            <ThemedText type="title">Welcome Back</ThemedText>
            <ThemedText type="subtitle">Sign in to your MerchTrader account</ThemedText>
          </View>

          <View style={styles.form}>
            {errors.general && (
              <View style={styles.errorContainer}>
                <MaterialIconWithFallback name="error" size={16} color="#ef4444" />
                <Text style={styles.errorText}>{errors.general}</Text>
              </View>
            )}

            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>Email Address</ThemedText>
              <View style={[styles.inputContainer, errors.email && styles.inputError]}>
                <MaterialIconWithFallback name="email" size={20} color="#6b7280" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={handleEmailChange}
                  placeholder="Enter your email"
                  placeholderTextColor="#9ca3af"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="next"
                  blurOnSubmit={false}
                />
              </View>
              {errors.email && <Text style={styles.fieldError}>{errors.email}</Text>}
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>Password</ThemedText>
              <View style={[styles.inputContainer, errors.password && styles.inputError]}>
                <MaterialIconWithFallback name="lock" size={20} color="#6b7280" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={handlePasswordChange}
                  placeholder="Enter your password"
                  placeholderTextColor="#9ca3af"
                  secureTextEntry={!isPasswordVisible}
                  autoCapitalize="none"
                  autoComplete="password"
                  textContentType="password"
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                />
                <TouchableOpacity
                  onPress={togglePasswordVisibility}
                  style={styles.eyeIcon}
                  activeOpacity={0.7}
                >
                  <MaterialIconWithFallback 
                    name={isPasswordVisible ? 'visibility' : 'visibility-off'} 
                    size={20} 
                    color="#6b7280" 
                  />
                </TouchableOpacity>
              </View>
              {errors.password && <Text style={styles.fieldError}>{errors.password}</Text>}
            </View>

            <TouchableOpacity
              style={styles.forgotPassword}
              onPress={handleForgotPassword}
              activeOpacity={0.7}
            >
              <ThemedText style={styles.forgotPasswordText}>
                Forgot your password?
              </ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.loginButton, loading && styles.disabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <ThemedText style={styles.loginButtonText}>Sign In</ThemedText>
              )}
            </TouchableOpacity>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <ThemedText style={styles.dividerText}>or</ThemedText>
              <View style={styles.dividerLine} />
            </View>

            {/* Google Sign In Button */}
            <TouchableOpacity
              style={[styles.socialButton, styles.googleButton, (googleLoading || loading) && styles.disabled]}
              onPress={handleGoogleSignIn}
              disabled={googleLoading || loading}
              activeOpacity={0.8}
            >
              {googleLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Text style={styles.socialIcon}>🔵</Text>
                  <ThemedText style={styles.socialButtonText}>Continue with Google</ThemedText>
                </>
              )}
            </TouchableOpacity>

            {/* Apple Sign In Button - Show on iOS and Web */}
            {/* Show on iOS, or on web if Apple Client ID is configured */}
            {((Platform.OS === 'ios' || Platform.OS === 'web') && 
              (Platform.OS === 'ios' || process.env.EXPO_PUBLIC_APPLE_CLIENT_ID || process.env.EXPO_PUBLIC_APPLE_SERVICE_ID)) && (
              <TouchableOpacity
                style={[styles.socialButton, styles.appleButton, (appleLoading || loading) && styles.disabled]}
                onPress={handleAppleSignIn}
                disabled={appleLoading || loading}
                activeOpacity={0.8}
              >
                {appleLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Text style={styles.socialIcon}>🍎</Text>
                    <ThemedText style={styles.socialButtonText}>Continue with Apple</ThemedText>
                  </>
                )}
              </TouchableOpacity>
            )}

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <ThemedText style={styles.dividerText}>or</ThemedText>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity
              style={styles.linkButton}
              onPress={handleRegisterPress}
              activeOpacity={0.7}
            >
              <ThemedText style={styles.linkText}>
                Do not have an account? <Text style={styles.linkBold}>Sign up</Text>
              </ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.businessInquiriesButton}
              onPress={() => setShowBusinessInquiriesModal(true)}
              activeOpacity={0.7}
            >
              <ThemedText style={styles.businessInquiriesText}>
                BUSINESS INQUIRIES?
              </ThemedText>
            </TouchableOpacity>
          </View>
        </ThemedView>
      </ScrollView>

      {/* Business Inquiries Modal */}
      <Modal
        visible={showBusinessInquiriesModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowBusinessInquiriesModal(false)}
      >
        <View style={styles.modalOverlay}>
          <ThemedView style={styles.businessModalContent}>
            <ThemedText type="title" style={styles.businessModalTitle}>
              Business Inquiries
            </ThemedText>
            <ThemedText style={styles.businessModalSubtitle}>
              Contact us for business partnerships and inquiries
            </ThemedText>
            
            <View style={styles.emailContainer}>
              <ThemedText style={styles.emailLabel}>Email Address:</ThemedText>
              <View style={styles.emailBox}>
                <ThemedText style={styles.emailText}>mymerchtrader@gmail.com</ThemedText>
              </View>
            </View>

            <TouchableOpacity
              style={styles.copyButton}
              onPress={async () => {
                const emailAddress = 'mymerchtrader@gmail.com';
                try {
                  if (Platform.OS === 'web') {
                    await navigator.clipboard.writeText(emailAddress);
                  } else {
                    await Clipboard.setStringAsync(emailAddress);
                  }
                  setEmailCopied(true);
                  setTimeout(() => {
                    setEmailCopied(false);
                  }, 2000);
                } catch (error) {
                  console.error('Error copying to clipboard:', error);
                  Alert.alert('Error', 'Failed to copy email address');
                }
              }}
              activeOpacity={0.8}
            >
              <MaterialIconWithFallback 
                name={emailCopied ? 'check' : 'content-copy'} 
                size={20} 
                color="#fff" 
                style={styles.copyIcon}
              />
              <ThemedText style={styles.copyButtonText}>
                {emailCopied ? 'Copied!' : 'Copy Email'}
              </ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowBusinessInquiriesModal(false)}
              activeOpacity={0.7}
            >
              <ThemedText style={styles.closeButtonText}>Close</ThemedText>
            </TouchableOpacity>
          </ThemedView>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // Prevent layout shifts on Android
    ...(Platform.OS === 'android' && {
      flexDirection: 'column',
    }),
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    // Removed minHeight - was causing layout issues
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    // Removed flexShrink - was interfering with keyboard
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logo: {
    marginBottom: 24,
  },
  form: {
    width: '100%',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    flex: 1,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  inputError: {
    borderColor: '#ef4444',
  },
  inputIcon: {
    marginLeft: 12,
  },
  input: {
    flex: 1,
    padding: 16,
    fontSize: 16,
  },
  eyeIcon: {
    padding: 12,
  },
  fieldError: {
    color: '#ef4444',
    fontSize: 12,
    marginTop: 4,
  },
  forgotPassword: {
    alignItems: 'flex-end',
    marginBottom: 24,
  },
  forgotPasswordText: {
    color: '#3b82f6',
    fontSize: 14,
  },
  loginButton: {
    backgroundColor: '#3b82f6',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 24,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.6,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e5e7eb',
  },
  dividerText: {
    marginHorizontal: 16,
    color: '#6b7280',
    fontSize: 14,
  },
  linkButton: {
    alignItems: 'center',
  },
  linkText: {
    color: '#6b7280',
    fontSize: 14,
  },
  linkBold: {
    color: '#3b82f6',
    fontWeight: '600',
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    gap: 12,
  },
  googleButton: {
    backgroundColor: '#4285f4',
  },
  appleButton: {
    backgroundColor: '#000',
  },
  socialButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  socialIcon: {
    fontSize: 20,
  },
  businessInquiriesButton: {
    alignItems: 'center',
    marginTop: 24,
    padding: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#3b82f6',
    backgroundColor: 'transparent',
  },
  businessInquiriesText: {
    color: '#3b82f6',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  businessModalContent: {
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  businessModalTitle: {
    textAlign: 'center',
    marginBottom: 8,
    fontSize: 24,
  },
  businessModalSubtitle: {
    textAlign: 'center',
    marginBottom: 24,
    fontSize: 14,
    opacity: 0.7,
  },
  emailContainer: {
    width: '100%',
    marginBottom: 24,
  },
  emailLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    opacity: 0.8,
  },
  emailBox: {
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  emailText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#3b82f6',
    textAlign: 'center',
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    width: '100%',
    marginBottom: 12,
    gap: 8,
  },
  copyIcon: {
    marginRight: 4,
  },
  copyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  closeButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#6b7280',
    fontSize: 14,
    fontWeight: '500',
  },
});