import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCart } from '@/contexts/CartContext';
import { checkoutAPI } from '@/services/api';
import { env } from '@/config/environment';
import * as WebBrowser from 'expo-web-browser';
import { AccountStatusIndicator } from '@/components/AccountStatusIndicator';

interface CartHeaderProps {
  color?: string;
  size?: number;
}

export function CartHeader({ color = '#6b7280', size = 32 }: CartHeaderProps) {
  const router = useRouter();
  const { cart, getTotalItems } = useCart();
  const [base, setBase] = useState('');
  
  const totalItems = getTotalItems();

  useEffect(() => {
    // Determine absolute base URL for web and native
    if (Platform.OS === 'web') {
      setBase(window.location.origin);
    } else {
      setBase(env.frontendUrl.replace(/\/$/, ''));
    }
  }, []);
  
  const handlePress = async () => {
    console.log('🔗 CART_HEADER_DEBUG: Cart clicked! Cart length:', cart.length);
    console.log('🔗 CART_HEADER_DEBUG: Cart contents:', cart);
    
    // If cart is empty, navigate to cart page to show empty state
    if (cart.length === 0) {
      console.log('🔗 CART_HEADER_DEBUG: Cart is empty, navigating to cart page');
      router.push('/store/cart');
      return;
    }

    console.log('🔗 CART_HEADER_DEBUG: Cart has items, proceeding with checkout');

    // If cart has items, directly open Stripe checkout
    try {
      // Ensure base URL is set before creating session
      if (Platform.OS === 'web' && !base) {
        Alert.alert('Error', 'Could not determine checkout URL. Please refresh and try again.');
        return;
      }

      const items = cart.map((c) => ({ productId: c.product.id, quantity: c.quantity }));
      const absBase = base || (Platform.OS === 'web' ? (typeof window !== 'undefined' ? window.location.origin : '') : env.frontendUrl.replace(/\/$/, ''));
      const successUrl = `${absBase}/store/checkout-success`;
      const cancelUrl = `${absBase}/store/cart`;

      console.log('🔗 CART_HEADER_CHECKOUT: Creating session with items:', items);
      console.log('🔗 CART_HEADER_CHECKOUT: Success URL:', successUrl);
      console.log('🔗 CART_HEADER_CHECKOUT: Cancel URL:', cancelUrl);

      // Pre-open a blank window on web to avoid Safari popup blocking
      let preOpened: Window | null = null;
      if (Platform.OS === 'web') {
        preOpened = window.open('', '_blank');
      }

      const response = await checkoutAPI.createSession(items, successUrl, cancelUrl);
      console.log('🔗 CART_HEADER_CHECKOUT: API response:', response);

      const checkoutUrl = response.url;
      if (!checkoutUrl) {
        throw new Error('No checkout URL received from server');
      }

      console.log('🔗 CART_HEADER_CHECKOUT: Opening URL:', checkoutUrl);

      if (Platform.OS === 'web') {
        // Prefer same-tab redirect on iOS Safari to avoid popup blocking
        const ua = navigator.userAgent || '';
        const isIOS = /iPhone|iPad|iPod/i.test(ua);
        const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
        if (isIOS && isSafari) {
          window.location.assign(checkoutUrl);
        } else {
          if (preOpened) {
            preOpened.location.href = checkoutUrl;
          } else {
            const newWindow = window.open(checkoutUrl, '_blank');
            if (!newWindow) {
              console.warn('🔗 CART_HEADER_CHECKOUT: Popup blocked, redirecting in same window');
              window.location.href = checkoutUrl;
            }
          }
        }
      } else {
        await WebBrowser.openBrowserAsync(checkoutUrl);
        console.log('🔗 CART_HEADER_CHECKOUT: Opened Stripe checkout in WebBrowser');
      }
    } catch (err: any) {
      console.error('🔴 CART_HEADER_CHECKOUT ERROR:', err);
      console.error('🔴 CART_HEADER_CHECKOUT ERROR Details:', {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status,
      });
      Alert.alert('Error', 'Failed to initiate checkout. Please try again.');
    }
  };

  return (
    <View style={styles.actionGroup}>
      <AccountStatusIndicator color={color} compact />
      <TouchableOpacity
        style={styles.container}
        onPress={handlePress}
        activeOpacity={0.7}
      >
        <MaterialIcons name="shopping-cart" size={size} color={color} />
        {totalItems > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {totalItems > 99 ? '99+' : totalItems.toString()}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  actionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  container: {
    position: 'relative',
    padding: 4,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
}); 