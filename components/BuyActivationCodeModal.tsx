import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  Linking,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { accessCodeAPI } from '@/services/api';

interface BuyActivationCodeModalProps {
  visible: boolean;
  onClose: () => void;
  contentType: 'playlist' | 'slideshow';
  contentId: string;
  contentName?: string;
}

const PRICE_CENTS = 500; // $5.00

export default function BuyActivationCodeModal({
  visible,
  onClose,
  contentType,
  contentId,
  contentName,
}: BuyActivationCodeModalProps) {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const handleBuy = async () => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) {
      Alert.alert('Invalid Phone', 'Please enter a valid phone number.');
      return;
    }

    setLoading(true);
    try {
      const base = Platform.OS === 'web' ? (typeof window !== 'undefined' ? window.location.origin : '') : 'yourappscheme://';
      const successUrl = `${base}/store/checkout-success?type=activation_code&session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${base}/store/checkout-cancel`;

      const payload = contentType === 'playlist'
        ? { playlistId: contentId, phone, successUrl, cancelUrl }
        : { slideshowId: contentId, phone, successUrl, cancelUrl };

      const { url } = await accessCodeAPI.createPurchaseSession(payload);

      if (!url) {
        throw new Error('No checkout URL returned');
      }

      onClose();
      setPhone('');

      if (Platform.OS === 'web') {
        window.location.href = url;
      } else if (Platform.OS === 'ios') {
        try {
          await WebBrowser.openBrowserAsync(url, {
            dismissButtonStyle: 'done',
            presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
            controlsColor: '#3b82f6',
          });
        } catch (webBrowserError) {
          const canOpen = await Linking.canOpenURL(url);
          if (canOpen) {
            await Linking.openURL(url);
          } else {
            throw new Error('Cannot open checkout URL');
          }
        }
      } else {
        await WebBrowser.openBrowserAsync(url);
      }
    } catch (error: any) {
      const msg = error?.response?.data?.error || error?.message || 'Failed to start checkout.';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>Buy Activation Code</Text>
          <Text style={styles.subtitle}>
            Enter your phone number. After payment, your activation code will be texted to you.
          </Text>
          <Text style={styles.price}>${(PRICE_CENTS / 100).toFixed(2)}</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="Phone number"
            placeholderTextColor="#9ca3af"
            keyboardType="phone-pad"
            editable={!loading}
          />
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelButton} onPress={onClose} disabled={loading}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.buyButton, loading && styles.disabledButton]}
              onPress={handleBuy}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.buyButtonText}>Continue to Payment</Text>
              )}
            </TouchableOpacity>
          </View>
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
    borderRadius: 12,
    padding: 24,
    width: '100%',
    maxWidth: 360,
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
  price: {
    fontSize: 24,
    fontWeight: '700',
    color: '#3b82f6',
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#6b7280',
  },
  buyButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 140,
    alignItems: 'center',
  },
  buyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  disabledButton: {
    opacity: 0.7,
  },
});
