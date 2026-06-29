import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useCart } from '@/contexts/CartContext';
import { analyticsService } from '@/services/analyticsService';
import { useAuth } from '@/contexts/AuthContext';

export default function CheckoutSuccess() {
  const router = useRouter();
  const { session_id, type, contentType, contentId } = useLocalSearchParams<{
    session_id?: string;
    type?: string;
    contentType?: string;
    contentId?: string;
  }>();
  const { cart, clearCart, getTotalPrice } = useCart();
  const { user, isAuthenticated } = useAuth();
  const [purchaseTracked, setPurchaseTracked] = React.useState(false);

  const isActivationCodePurchase = type === 'activation_code';
  const normalizedContentType =
    contentType === 'playlist' || contentType === 'slideshow' ? contentType : undefined;
  const normalizedContentId = typeof contentId === 'string' ? contentId : undefined;
  const contentAccessPath =
    normalizedContentType && normalizedContentId
      ? `/${normalizedContentType === 'playlist' ? 'playlist-access' : 'slideshow-access'}/${normalizedContentId}`
      : undefined;

  React.useEffect(() => {
    const trackPurchase = async () => {
      if (isActivationCodePurchase) {
        return;
      }
      if (purchaseTracked || !session_id || cart.length === 0) {
        return;
      }

      try {
        const stripeSessionId = Array.isArray(session_id) ? session_id[0] : session_id;
        const totalAmount = getTotalPrice();

        const items = cart.map((item) => ({
          productId: item.product.id,
          productName: item.product.name,
          quantity: item.quantity,
          price: item.product.price,
        }));

        await analyticsService.trackPurchase(stripeSessionId, items, totalAmount, user?.id);
        setPurchaseTracked(true);
      } catch (error) {
        console.error('Error tracking purchase:', error);
      }
    };

    trackPurchase().then(() => {
      if (!isActivationCodePurchase) {
        clearCart();
      }
    });
  }, [session_id, cart, purchaseTracked, isActivationCodePurchase, clearCart, getTotalPrice, user?.id]);

  const handleCreateAccount = () => {
    router.push({
      pathname: '/auth/register-viewer',
      params: contentAccessPath ? { returnTo: contentAccessPath } : undefined,
    });
  };

  const handleLogin = () => {
    router.push({
      pathname: '/auth/login',
      params: contentAccessPath ? { returnTo: contentAccessPath } : undefined,
    });
  };

  const handleContinueToContent = () => {
    if (contentAccessPath) {
      router.replace(contentAccessPath as any);
      return;
    }
    router.replace('/(tabs)/store');
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>
        {isActivationCodePurchase ? 'Payment successful!' : 'Thank you for your purchase!'}
      </ThemedText>
      <ThemedText style={styles.subtitle}>
        {isActivationCodePurchase
          ? 'Your activation code has been sent via text. Check your phone and enter the code to access your content.'
          : 'Your payment was successful.'}
      </ThemedText>

      {isActivationCodePurchase && !isAuthenticated && (
        <View style={styles.accountPrompt}>
          <ThemedText style={styles.accountPromptTitle}>Save your purchase</ThemedText>
          <ThemedText style={styles.accountPromptText}>
            Create a free account or sign in so we can remember your access and stop asking for
            verification again.
          </ThemedText>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleCreateAccount}>
            <ThemedText style={styles.primaryBtnText}>Create account</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={handleLogin}>
            <ThemedText style={styles.secondaryBtnText}>Log in</ThemedText>
          </TouchableOpacity>
        </View>
      )}

      {contentAccessPath ? (
        <TouchableOpacity style={styles.homeBtn} onPress={handleContinueToContent}>
          <ThemedText style={styles.homeText}>Continue to content</ThemedText>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.homeBtn} onPress={() => router.replace('/(tabs)/store')}>
          <ThemedText style={styles.homeText}>
            {isActivationCodePurchase ? 'Back to Store' : 'Continue Shopping'}
          </ThemedText>
        </TouchableOpacity>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  title: { marginBottom: 12, textAlign: 'center' },
  subtitle: { textAlign: 'center', opacity: 0.8, marginBottom: 24 },
  accountPrompt: {
    width: '100%',
    maxWidth: 420,
    marginBottom: 24,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  accountPromptTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  accountPromptText: {
    fontSize: 14,
    opacity: 0.85,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 20,
  },
  primaryBtn: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 10,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  secondaryBtnText: { fontSize: 16, fontWeight: '600' },
  homeBtn: { backgroundColor: '#2563eb', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  homeText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
