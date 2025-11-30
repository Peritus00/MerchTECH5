import { useState } from 'react';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import { useAuth } from '@/contexts/AuthContext';

interface AppleSignInResult {
  success: boolean;
  error?: string;
}

export function useAppleSignIn() {
  const [loading, setLoading] = useState(false);
  const { socialLogin } = useAuth();

  const signIn = async (): Promise<AppleSignInResult> => {
    setLoading(true);
    try {
      // Apple Sign-In is only available on iOS
      if (Platform.OS !== 'ios') {
        return { 
          success: false, 
          error: 'Apple Sign-In is only available on iOS devices' 
        };
      }

      // Check if Apple Authentication is available
      const isAvailable = await AppleAuthentication.isAvailableAsync();
      if (!isAvailable) {
        return { 
          success: false, 
          error: 'Apple Sign-In is not available on this device' 
        };
      }

      // Generate a random nonce for security
      const nonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
      );

      // Request Apple authentication
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce,
      });

      if (!credential.identityToken) {
        return { success: false, error: 'No identity token received from Apple' };
      }

      // Use AuthContext to handle the login
      await socialLogin('apple', credential.identityToken, nonce);
      
      return { success: true };
    } catch (error: any) {
      console.error('Apple sign-in error:', error);
      
      // Handle user cancellation
      if (error.code === 'ERR_REQUEST_CANCELED') {
        return { success: false, error: 'Apple sign-in was cancelled' };
      }
      
      return { 
        success: false, 
        error: error.message || 'Apple sign-in failed' 
      };
    } finally {
      setLoading(false);
    }
  };

  return { signIn, loading };
}

