import React, { useCallback, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface CheckoutLaunchBannerProps {
  checkoutUrl: string | null;
  source: string;
  onDismiss: () => void;
  message?: string;
}

export default function CheckoutLaunchBanner({
  checkoutUrl,
  source,
  onDismiss,
  message,
}: CheckoutLaunchBannerProps) {
  const [isOpening, setIsOpening] = useState(false);

  const handleOpenCheckout = useCallback(() => {
    if (!checkoutUrl || isOpening || typeof window === 'undefined') return;

    setIsOpening(true);
    try {
      // Direct open from the tap handler (no await) — most reliable on mobile Safari.
      const w = window.open(checkoutUrl, '_blank');
      if (w) {
        w.focus?.();
        onDismiss();
      }
    } catch (error) {
      console.error(`🔗 PAYMENT (${source} fallback): Failed to open checkout:`, error);
    } finally {
      setIsOpening(false);
    }
  }, [checkoutUrl, isOpening, onDismiss, source]);

  const handleOpenSameTab = useCallback(() => {
    if (!checkoutUrl || Platform.OS !== 'web' || typeof window === 'undefined') return;
    window.location.assign(checkoutUrl);
  }, [checkoutUrl]);

  if (!checkoutUrl || Platform.OS !== 'web') {
    return null;
  }

  return (
    <View style={styles.banner}>
      <View style={styles.iconWrap}>
        <MaterialIcons name="open-in-new" size={22} color="#fff" />
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>Checkout is ready</Text>
        <Text style={styles.message}>
          {message ?? 'Open Stripe in a new tab so the original playlist can keep playing.'}
        </Text>
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.primaryButton, isOpening && styles.primaryButtonDisabled]}
            onPress={handleOpenCheckout}
            disabled={isOpening}
          >
            <Text style={styles.primaryButtonText}>
              {isOpening ? 'Opening...' : 'Open Checkout'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={handleOpenSameTab}>
            <Text style={styles.secondaryButtonText}>Open Here Instead</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dismissButton} onPress={onDismiss}>
            <Text style={styles.dismissButtonText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    zIndex: 1000,
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(17, 24, 39, 0.96)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  content: {
    flex: 1,
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  message: {
    color: 'rgba(255, 255, 255, 0.82)',
    fontSize: 13,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  primaryButton: {
    backgroundColor: '#f59e0b',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '700',
  },
  secondaryButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  dismissButton: {
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  dismissButtonText: {
    color: 'rgba(255, 255, 255, 0.72)',
    fontSize: 13,
    fontWeight: '600',
  },
});
