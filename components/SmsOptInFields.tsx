import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SMS_TRANSACTIONAL_CONSENT_TEXT, SMS_MARKETING_OPT_IN_TEXT } from '@/constants/smsConsent';

export interface SmsOptInFieldsProps {
  phone: string;
  onPhoneChange: (value: string) => void;
  smsConsent: boolean;
  onSmsConsentChange: (value: boolean) => void;
  termsConsent: boolean;
  onTermsConsentChange: (value: boolean) => void;
  /** Optional separate marketing SMS opt-in (unchecked by default). */
  showMarketingOptIn?: boolean;
  marketingConsent?: boolean;
  onMarketingConsentChange?: (value: boolean) => void;
  marketingConsentText?: string;
  sending: boolean;
  onSend: () => void;
  /** Primary action label — provider requires "SEND". */
  sendButtonLabel?: string;
  disabled?: boolean;
}

export default function SmsOptInFields({
  phone,
  onPhoneChange,
  smsConsent,
  onSmsConsentChange,
  termsConsent,
  onTermsConsentChange,
  showMarketingOptIn = false,
  marketingConsent = false,
  onMarketingConsentChange,
  marketingConsentText = SMS_MARKETING_OPT_IN_TEXT,
  sending,
  onSend,
  sendButtonLabel = 'SEND',
  disabled = false,
}: SmsOptInFieldsProps) {
  const router = useRouter();
  const blocked = disabled || sending;

  return (
    <View>
      <TextInput
        style={styles.input}
        placeholder="Phone number"
        placeholderTextColor="#9ca3af"
        value={phone}
        onChangeText={onPhoneChange}
        keyboardType={Platform.OS === 'web' ? 'tel' : 'phone-pad'}
        editable={!blocked}
      />

      <TouchableOpacity
        style={[styles.checkboxRow, smsConsent && styles.checkboxChecked]}
        onPress={() => onSmsConsentChange(!smsConsent)}
        disabled={blocked}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: smsConsent }}
      >
        <MaterialIcons
          name={smsConsent ? 'check-box' : 'check-box-outline-blank'}
          size={24}
          color={smsConsent ? '#3b82f6' : '#9ca3af'}
          style={styles.checkboxIcon}
        />
        <Text style={styles.checkboxLabel}>{SMS_TRANSACTIONAL_CONSENT_TEXT}</Text>
      </TouchableOpacity>

      <View style={[styles.checkboxRow, termsConsent && styles.checkboxChecked]}>
        <TouchableOpacity
          onPress={() => onTermsConsentChange(!termsConsent)}
          disabled={blocked}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: termsConsent }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialIcons
            name={termsConsent ? 'check-box' : 'check-box-outline-blank'}
            size={24}
            color={termsConsent ? '#3b82f6' : '#9ca3af'}
            style={styles.checkboxIcon}
          />
        </TouchableOpacity>
        <View style={styles.termsTextBlock}>
          <Text style={styles.termsWrap}>
            <Text style={styles.checkboxLabelInline}>I agree to the </Text>
            <Text
              style={styles.link}
              onPress={() => router.push('/legal/terms')}
              accessibilityRole="link"
            >
              Terms and Conditions
            </Text>
            <Text style={styles.checkboxLabelInline}> and </Text>
            <Text
              style={styles.link}
              onPress={() => router.push('/legal/privacy')}
              accessibilityRole="link"
            >
              Privacy Policy
            </Text>
            <Text style={styles.checkboxLabelInline}>.</Text>
          </Text>
        </View>
      </View>

      {showMarketingOptIn && onMarketingConsentChange && (
        <TouchableOpacity
          style={[styles.checkboxRow, marketingConsent && styles.checkboxChecked]}
          onPress={() => onMarketingConsentChange(!marketingConsent)}
          disabled={blocked}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: marketingConsent }}
        >
          <MaterialIcons
            name={marketingConsent ? 'check-box' : 'check-box-outline-blank'}
            size={24}
            color={marketingConsent ? '#3b82f6' : '#9ca3af'}
            style={styles.checkboxIcon}
          />
          <Text style={styles.checkboxLabel}>{marketingConsentText}</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={[styles.btn, styles.btnPrimary, blocked && styles.btnDisabled]}
        onPress={onSend}
        disabled={blocked}
      >
        {sending ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.btnPrimaryText}>{sendButtonLabel}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
    color: '#1f2937',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  checkboxChecked: {},
  checkboxIcon: {
    marginTop: 2,
  },
  checkboxLabel: {
    fontSize: 14,
    color: '#374151',
    marginLeft: 8,
    flex: 1,
    lineHeight: 20,
  },
  termsTextBlock: {
    flex: 1,
    marginLeft: 8,
  },
  termsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  checkboxLabelInline: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  link: {
    fontSize: 14,
    color: '#2563eb',
    fontWeight: '600',
    textDecorationLine: 'underline',
    lineHeight: 20,
  },
  btn: {
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnPrimary: {
    backgroundColor: '#3b82f6',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnPrimaryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
