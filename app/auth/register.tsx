
import React, { useState } from 'react';
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
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/contexts/AuthContext';
import { MaterialIcons } from '@expo/vector-icons';

interface FormErrors {
  email?: string;
  username?: string;
  password?: string;
  confirmPassword?: string;
  general?: string;
}

interface PasswordStrength {
  score: number;
  feedback: string[];
}

export default function RegisterScreen() {
  const [formData, setFormData] = useState({
    email: '',
    username: '',
    password: '',
    confirmPassword: '',
  });
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [passwordStrength, setPasswordStrength] = useState<PasswordStrength>({ score: 0, feedback: [] });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [agreeToPrivacy, setAgreeToPrivacy] = useState(false);
  
  const { register, isLoading } = useAuth();
  const router = useRouter();

  const updateFormData = (field: keyof typeof formData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear errors for the field being updated
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }

    // Update password strength if password field
    if (field === 'password') {
      setPasswordStrength(calculatePasswordStrength(value));
    }
  };

  const calculatePasswordStrength = (password: string): PasswordStrength => {
    const feedback: string[] = [];
    let score = 0;

    if (password.length >= 8) score += 1;
    else feedback.push('At least 8 characters');

    if (/[A-Z]/.test(password)) score += 1;
    else feedback.push('One uppercase letter');

    if (/[a-z]/.test(password)) score += 1;
    else feedback.push('One lowercase letter');

    if (/\d/.test(password)) score += 1;
    else feedback.push('One number');

    if (/[^A-Za-z0-9]/.test(password)) score += 1;
    else feedback.push('One special character');

    return { score, feedback };
  };

  const getPasswordStrengthColor = (score: number): string => {
    if (score <= 1) return '#ef4444';
    if (score <= 2) return '#f59e0b';
    if (score <= 3) return '#eab308';
    if (score <= 4) return '#84cc16';
    return '#22c55e';
  };

  const getPasswordStrengthText = (score: number): string => {
    if (score <= 1) return 'Very Weak';
    if (score <= 2) return 'Weak';
    if (score <= 3) return 'Fair';
    if (score <= 4) return 'Good';
    return 'Strong';
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // Email validation
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!formData.email.includes('@')) {
      newErrors.email = 'Please enter a valid email address';
    }

    // Username validation
    if (!formData.username.trim()) {
      newErrors.username = 'Username is required';
    } else if (formData.username.length < 3) {
      newErrors.username = 'Username must be at least 3 characters';
    } else if (!/^[a-zA-Z0-9_]+$/.test(formData.username)) {
      newErrors.username = 'Username can only contain letters, numbers, and underscores';
    }

    // Password validation
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (passwordStrength.score < 3) {
      newErrors.password = 'Please choose a stronger password';
    }

    // Confirm password validation
    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    // Terms and privacy agreement validation
    if (!agreeToTerms) {
      newErrors.general = 'You must agree to the Terms of Service to create an account';
    } else if (!agreeToPrivacy) {
      newErrors.general = 'You must agree to the Privacy Policy to create an account';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleRegister = async () => {
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    try {
      const result = await register(
        formData.email.trim(),
        formData.password,
        formData.username.trim()
      );
      
      if (result.success) {
        Alert.alert(
          'Registration Successful!',
          'Welcome to MerchTech! Please choose your subscription plan to get started.',
          [
            {
              text: 'Choose Plan',
              onPress: () => router.push('/subscription/?newUser=true')
            }
          ]
        );
      } else {
        setErrors({ general: result.error || 'Registration failed' });
      }
    } catch (error: any) {
      setErrors({ general: error.message || 'An unexpected error occurred' });
    } finally {
      setIsSubmitting(false);
    }
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
            <ThemedText type="title">Create Account</ThemedText>
            <ThemedText type="subtitle">Join MerchTech today</ThemedText>
          </View>

          <View style={styles.form}>
            {errors.general && (
              <View style={styles.errorContainer}>
                <MaterialIcons name="error" size={16} color="#ef4444" />
                <Text style={styles.errorText}>{errors.general}</Text>
              </View>
            )}

            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>Email Address</ThemedText>
              <View style={[styles.inputContainer, errors.email && styles.inputError]}>
                <MaterialIcons name="email" size={20} color="#6b7280" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={formData.email}
                  onChangeText={(text) => updateFormData('email', text)}
                  placeholder="Enter your email"
                  placeholderTextColor="#9ca3af"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                />
              </View>
              {errors.email && <Text style={styles.fieldError}>{errors.email}</Text>}
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>Username</ThemedText>
              <View style={[styles.inputContainer, errors.username && styles.inputError]}>
                <MaterialIcons name="person" size={20} color="#6b7280" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={formData.username}
                  onChangeText={(text) => updateFormData('username', text)}
                  placeholder="Choose a username"
                  placeholderTextColor="#9ca3af"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="username"
                />
              </View>
              {errors.username && <Text style={styles.fieldError}>{errors.username}</Text>}
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>Password</ThemedText>
              <View style={[styles.inputContainer, errors.password && styles.inputError]}>
                <MaterialIcons name="lock" size={20} color="#6b7280" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={formData.password}
                  onChangeText={(text) => updateFormData('password', text)}
                  placeholder="Create a password"
                  placeholderTextColor="#9ca3af"
                  secureTextEntry={!isPasswordVisible}
                  autoCapitalize="none"
                  autoComplete="new-password"
                />
                <TouchableOpacity
                  onPress={() => setIsPasswordVisible(!isPasswordVisible)}
                  style={styles.eyeIcon}
                >
                  <MaterialIcons 
                    name={isPasswordVisible ? 'visibility' : 'visibility-off'} 
                    size={20} 
                    color="#6b7280" 
                  />
                </TouchableOpacity>
              </View>
              
              {formData.password && (
                <View style={styles.passwordStrength}>
                  <View style={styles.strengthHeader}>
                    <Text style={styles.strengthLabel}>Password Strength: </Text>
                    <Text style={[styles.strengthText, { color: getPasswordStrengthColor(passwordStrength.score) }]}>
                      {getPasswordStrengthText(passwordStrength.score)}
                    </Text>
                  </View>
                  <View style={styles.strengthBar}>
                    {[1, 2, 3, 4, 5].map((level) => (
                      <View
                        key={level}
                        style={[
                          styles.strengthSegment,
                          {
                            backgroundColor: level <= passwordStrength.score 
                              ? getPasswordStrengthColor(passwordStrength.score) 
                              : '#e5e7eb'
                          }
                        ]}
                      />
                    ))}
                  </View>
                  {passwordStrength.feedback.length > 0 && (
                    <Text style={styles.strengthFeedback}>
                      Missing: {passwordStrength.feedback.join(', ')}
                    </Text>
                  )}
                </View>
              )}
              
              {errors.password && <Text style={styles.fieldError}>{errors.password}</Text>}
            </View>

            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>Confirm Password</ThemedText>
              <View style={[styles.inputContainer, errors.confirmPassword && styles.inputError]}>
                <MaterialIcons name="lock" size={20} color="#6b7280" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  value={formData.confirmPassword}
                  onChangeText={(text) => updateFormData('confirmPassword', text)}
                  placeholder="Confirm your password"
                  placeholderTextColor="#9ca3af"
                  secureTextEntry={!isConfirmPasswordVisible}
                  autoCapitalize="none"
                  autoComplete="new-password"
                />
                <TouchableOpacity
                  onPress={() => setIsConfirmPasswordVisible(!isConfirmPasswordVisible)}
                  style={styles.eyeIcon}
                >
                  <MaterialIcons 
                    name={isConfirmPasswordVisible ? 'visibility' : 'visibility-off'} 
                    size={20} 
                    color="#6b7280" 
                  />
                </TouchableOpacity>
              </View>
              {errors.confirmPassword && <Text style={styles.fieldError}>{errors.confirmPassword}</Text>}
            </View>

            <View style={styles.agreementSection}>
              <View style={styles.checkboxContainer}>
                <TouchableOpacity
                  style={[styles.checkbox, agreeToTerms && styles.checkboxChecked]}
                  onPress={() => setAgreeToTerms(!agreeToTerms)}
                >
                  {agreeToTerms && (
                    <MaterialIcons name="check" size={16} color="#fff" />
                  )}
                </TouchableOpacity>
                <View style={styles.checkboxTextContainer}>
                  <ThemedText style={styles.checkboxText}>
                    I agree to the{' '}
                    <TouchableOpacity
                      onPress={() => router.push('/legal/terms')}
                      style={styles.linkButton}
                    >
                      <ThemedText style={styles.linkText}>Terms of Service</ThemedText>
                    </TouchableOpacity>
                  </ThemedText>
                </View>
              </View>

              <View style={styles.checkboxContainer}>
                <TouchableOpacity
                  style={[styles.checkbox, agreeToPrivacy && styles.checkboxChecked]}
                  onPress={() => setAgreeToPrivacy(!agreeToPrivacy)}
                >
                  {agreeToPrivacy && (
                    <MaterialIcons name="check" size={16} color="#fff" />
                  )}
                </TouchableOpacity>
                <View style={styles.checkboxTextContainer}>
                  <ThemedText style={styles.checkboxText}>
                    I agree to the{' '}
                    <TouchableOpacity
                      onPress={() => router.push('/legal/privacy')}
                      style={styles.linkButton}
                    >
                      <ThemedText style={styles.linkText}>Privacy Policy</ThemedText>
                    </TouchableOpacity>
                  </ThemedText>
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
                <ThemedText style={styles.registerButtonText}>Create Account</ThemedText>
              )}
            </TouchableOpacity>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <ThemedText style={styles.dividerText}>or</ThemedText>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => router.push('/auth/login')}
            >
              <ThemedText style={styles.linkText}>
                Already have an account? <Text style={styles.linkBold}>Sign in</Text>
              </ThemedText>
            </TouchableOpacity>
          </View>
        </ThemedView>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
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
  passwordStrength: {
    marginTop: 8,
  },
  strengthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  strengthLabel: {
    fontSize: 12,
    color: '#6b7280',
  },
  strengthText: {
    fontSize: 12,
    fontWeight: '600',
  },
  strengthBar: {
    flexDirection: 'row',
    gap: 2,
    marginBottom: 4,
  },
  strengthSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  strengthFeedback: {
    fontSize: 11,
    color: '#6b7280',
  },
  agreementSection: {
    marginBottom: 20,
    marginTop: 8,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: '#d1d5db',
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  checkboxTextContainer: {
    flex: 1,
  },
  checkboxText: {
    fontSize: 14,
    lineHeight: 20,
  },
  linkButton: {
    display: 'inline',
  },
  linkText: {
    color: '#3b82f6',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  registerButton: {
    backgroundColor: '#3b82f6',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 8,
  },
  registerButtonText: {
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
});
