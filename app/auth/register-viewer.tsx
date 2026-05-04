import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/contexts/AuthContext';
import { MaterialIconWithFallback } from '@/components/MaterialIconWithFallback';
import { MerchTechLogo } from '@/components/MerchTechLogo';
import { settingsAPI } from '@/services/api';

interface FormErrors {
  email?: string;
  username?: string;
  password?: string;
  confirmPassword?: string;
  general?: string;
}

export default function RegisterViewerScreen() {
  const params = useLocalSearchParams<{ activationCode?: string }>();
  const initialCode =
    typeof params.activationCode === 'string'
      ? params.activationCode
      : Array.isArray(params.activationCode)
        ? params.activationCode[0] || ''
        : '';

  const [formData, setFormData] = useState({
    email: '',
    username: '',
    password: '',
    confirmPassword: '',
    activationCode: initialCode,
  });
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [agreeToPrivacy, setAgreeToPrivacy] = useState(false);

  const { registerViewer, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const check = async () => {
      try {
        const result = await settingsAPI.getViewerSignupsEnabled();
        if (!result.enabled) {
          router.replace('/auth/beta-splash');
        }
      } catch (e) {
        console.warn('Viewer signup check failed:', e);
      }
    };
    check();
  }, [router]);

  const updateFormData = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const validate = (): boolean => {
    const next: FormErrors = {};
    if (!formData.email?.includes('@')) next.email = 'Enter a valid email';
    if (formData.username.length < 3) next.username = 'Username must be at least 3 characters';
    if (formData.password.length < 8) next.password = 'Password must be at least 8 characters';
    const hasUpper = /[A-Z]/.test(formData.password);
    const hasLower = /[a-z]/.test(formData.password);
    const hasNum = /\d/.test(formData.password);
    if (!hasUpper || !hasLower || !hasNum) {
      next.password = 'Password must include uppercase, lowercase, and a number';
    }
    if (formData.password !== formData.confirmPassword) {
      next.confirmPassword = 'Passwords do not match';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleRegister = async () => {
    if (!agreeToTerms || !agreeToPrivacy) {
      Alert.alert('Required', 'Please accept the Terms of Service and Privacy Policy.');
      return;
    }
    if (!validate()) return;

    setIsSubmitting(true);
    setErrors({});
    const code = formData.activationCode.trim() || undefined;
    const result = await registerViewer(
      formData.email.trim(),
      formData.password,
      formData.username.trim(),
      code
    );
    if (!result.success) {
      const msg = result.error || '';
      if (msg.toLowerCase().includes('disabled') || msg.includes('503')) {
        router.replace('/auth/beta-splash');
        setIsSubmitting(false);
        return;
      }
      setErrors({ general: result.error || 'Registration failed' });
      setIsSubmitting(false);
      return;
    }
    router.replace('/(tabs)/');
    setIsSubmitting(false);
  };

  const loading = isLoading || isSubmitting;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ThemedView style={styles.content}>
          <View style={styles.header}>
            <MerchTechLogo size="large" variant="full" style={styles.logo} />
            <ThemedText type="title">Viewer account</ThemedText>
            <ThemedText type="subtitle" style={styles.subtitle}>
              Watch-only access. Save activation codes to your profile. Upgrade later to create
              content.
            </ThemedText>
          </View>

          <View style={styles.form}>
            {errors.general && (
              <View style={styles.errorContainer}>
                <MaterialIconWithFallback name="error" size={16} color="#ef4444" />
                <Text style={styles.errorText}>{errors.general}</Text>
              </View>
            )}

            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>Activation code (optional)</ThemedText>
              <View style={[styles.inputContainer]}>
                <MaterialIconWithFallback name="key" size={20} color="#6b7280" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={formData.activationCode}
                  onChangeText={(t) => updateFormData('activationCode', t)}
                  placeholder="Paste code to attach on signup"
                  placeholderTextColor="#9ca3af"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>Email</ThemedText>
              <View style={[styles.inputContainer, errors.email && styles.inputError]}>
                <MaterialIconWithFallback name="email" size={20} color="#6b7280" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={formData.email}
                  onChangeText={(t) => updateFormData('email', t)}
                  placeholder="Email"
                  placeholderTextColor="#9ca3af"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              {errors.email && <Text style={styles.fieldError}>{errors.email}</Text>}
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>Username</ThemedText>
              <View style={[styles.inputContainer, errors.username && styles.inputError]}>
                <MaterialIconWithFallback name="person" size={20} color="#6b7280" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={formData.username}
                  onChangeText={(t) => updateFormData('username', t)}
                  placeholder="Username"
                  placeholderTextColor="#9ca3af"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              {errors.username && <Text style={styles.fieldError}>{errors.username}</Text>}
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>Password</ThemedText>
              <View style={[styles.inputContainer, errors.password && styles.inputError]}>
                <MaterialIconWithFallback name="lock" size={20} color="#6b7280" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={formData.password}
                  onChangeText={(t) => updateFormData('password', t)}
                  placeholder="Password"
                  placeholderTextColor="#9ca3af"
                  secureTextEntry={!isPasswordVisible}
                  autoCapitalize="none"
                />
                <TouchableOpacity onPress={() => setIsPasswordVisible(!isPasswordVisible)} style={styles.eyeIcon}>
                  <MaterialIconWithFallback
                    name={isPasswordVisible ? 'visibility' : 'visibility-off'}
                    size={20}
                    color="#6b7280"
                  />
                </TouchableOpacity>
              </View>
              {errors.password && <Text style={styles.fieldError}>{errors.password}</Text>}
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>Confirm password</ThemedText>
              <View style={[styles.inputContainer, errors.confirmPassword && styles.inputError]}>
                <MaterialIconWithFallback name="lock" size={20} color="#6b7280" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={formData.confirmPassword}
                  onChangeText={(t) => updateFormData('confirmPassword', t)}
                  placeholder="Confirm password"
                  placeholderTextColor="#9ca3af"
                  secureTextEntry={!isConfirmPasswordVisible}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  onPress={() => setIsConfirmPasswordVisible(!isConfirmPasswordVisible)}
                  style={styles.eyeIcon}
                >
                  <MaterialIconWithFallback
                    name={isConfirmPasswordVisible ? 'visibility' : 'visibility-off'}
                    size={20}
                    color="#6b7280"
                  />
                </TouchableOpacity>
              </View>
              {errors.confirmPassword && <Text style={styles.fieldError}>{errors.confirmPassword}</Text>}
            </View>

            <View style={styles.agreementSection}>
              <View style={styles.checkboxRow}>
                <TouchableOpacity
                  style={[styles.checkbox, agreeToTerms && styles.checkboxChecked]}
                  onPress={() => setAgreeToTerms(!agreeToTerms)}
                >
                  {agreeToTerms && <MaterialIconWithFallback name="check" size={16} color="#fff" />}
                </TouchableOpacity>
                <View style={styles.checkboxTextContainer}>
                  <ThemedText style={styles.checkboxText}>I agree to the </ThemedText>
                  <TouchableOpacity onPress={() => router.push('/legal/terms')} style={styles.linkButton}>
                    <ThemedText style={styles.linkText}>Terms of Service</ThemedText>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.checkboxRow}>
                <TouchableOpacity
                  style={[styles.checkbox, agreeToPrivacy && styles.checkboxChecked]}
                  onPress={() => setAgreeToPrivacy(!agreeToPrivacy)}
                >
                  {agreeToPrivacy && <MaterialIconWithFallback name="check" size={16} color="#fff" />}
                </TouchableOpacity>
                <View style={styles.checkboxTextContainer}>
                  <ThemedText style={styles.checkboxText}>I agree to the </ThemedText>
                  <TouchableOpacity onPress={() => router.push('/legal/privacy')} style={styles.linkButton}>
                    <ThemedText style={styles.linkText}>Privacy Policy</ThemedText>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.registerButton, (loading || !agreeToTerms || !agreeToPrivacy) && styles.disabled]}
              onPress={handleRegister}
              disabled={loading || !agreeToTerms || !agreeToPrivacy}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <ThemedText style={styles.registerButtonText}>Create viewer account</ThemedText>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.loginLinkButton} onPress={() => router.push('/auth/login')}>
              <View style={styles.loginLinkContainer}>
                <ThemedText style={styles.checkboxText}>Already have an account? </ThemedText>
                <ThemedText style={styles.linkBold}>Sign in</ThemedText>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.loginLinkButton} onPress={() => router.push('/auth/register')}>
              <View style={styles.loginLinkContainer}>
                <ThemedText style={styles.checkboxText}>Need a creator account? </ThemedText>
                <ThemedText style={styles.linkBold}>Creator sign up</ThemedText>
              </View>
            </TouchableOpacity>
          </View>
        </ThemedView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  content: { flex: 1, padding: 24, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 32 },
  logo: { marginBottom: 16 },
  subtitle: { textAlign: 'center', marginTop: 8, paddingHorizontal: 8 },
  form: { width: '100%' },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  errorText: { color: '#ef4444', fontSize: 14, flex: 1 },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 16, fontWeight: '500', marginBottom: 8 },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  inputError: { borderColor: '#ef4444' },
  inputIcon: { marginLeft: 12 },
  input: { flex: 1, padding: 16, fontSize: 16 },
  eyeIcon: { padding: 12 },
  fieldError: { color: '#ef4444', fontSize: 12, marginTop: 4 },
  agreementSection: { marginVertical: 16 },
  checkboxRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#d1d5db',
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  checkboxTextContainer: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  checkboxText: { fontSize: 14, color: '#374151' },
  linkButton: {},
  linkText: { fontSize: 14, color: '#3b82f6', textDecorationLine: 'underline' },
  registerButton: {
    backgroundColor: '#3b82f6',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  registerButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  loginLinkButton: { marginTop: 20, alignItems: 'center' },
  loginLinkContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  linkBold: { fontSize: 14, fontWeight: '700', color: '#3b82f6' },
});
