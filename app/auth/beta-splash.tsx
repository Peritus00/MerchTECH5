import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { MerchTechLogo } from '@/components/MerchTechLogo';

const REDIRECT_URL = 'https://www.merchtrader.org/playlist-access/43';
const COUNTDOWN_SECONDS = 25;

export default function BetaSplashScreen() {
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const router = useRouter();

  useEffect(() => {
    // Start countdown timer
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          // Redirect when countdown reaches 0
          handleRedirect();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const handleRedirect = () => {
    if (Platform.OS === 'web') {
      // For web, use window.location
      window.location.href = REDIRECT_URL;
    } else {
      // For mobile, use Linking
      Linking.openURL(REDIRECT_URL).catch((err) => {
        console.error('Failed to open URL:', err);
      });
    }
  };

  const handleManualRedirect = () => {
    handleRedirect();
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <MerchTechLogo size="large" variant="full" style={styles.logo} />
        
        <ThemedText type="title" style={styles.title}>
          We are currently in BETA
        </ThemedText>
        
        <ThemedText style={styles.message}>
          Please reach out at{' '}
          <ThemedText 
            style={styles.emailLink}
            onPress={() => {
              const emailUrl = `mailto:mymerchtrader@gmail.com`;
              Linking.openURL(emailUrl).catch((err) => {
                console.error('Failed to open email:', err);
              });
            }}
          >
            mymerchtrader@gmail.com
          </ThemedText>
          {' '}if you are interested in participation.
        </ThemedText>
        
        <ThemedText style={styles.thankYou}>
          Thank You!
        </ThemedText>

        <View style={styles.countdownContainer}>
          <ThemedText style={styles.countdownLabel}>
            Redirecting in:
          </ThemedText>
          <ThemedText style={styles.countdown}>
            {countdown}
          </ThemedText>
        </View>

        <TouchableOpacity
          style={styles.redirectButton}
          onPress={handleManualRedirect}
        >
          <ThemedText style={styles.redirectButtonText}>
            Continue Now
          </ThemedText>
        </TouchableOpacity>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#f8fafc',
  },
  content: {
    width: '100%',
    maxWidth: 500,
    alignItems: 'center',
  },
  logo: {
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 24,
    color: '#1e293b',
  },
  message: {
    fontSize: 18,
    lineHeight: 28,
    textAlign: 'center',
    marginBottom: 16,
    color: '#475569',
  },
  emailLink: {
    color: '#3b82f6',
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
  thankYou: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 32,
    color: '#1e293b',
  },
  countdownContainer: {
    alignItems: 'center',
    marginBottom: 24,
    padding: 20,
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    minWidth: 150,
  },
  countdownLabel: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 8,
  },
  countdown: {
    fontSize: 48,
    fontWeight: '700',
    color: '#3b82f6',
  },
  redirectButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 8,
    minWidth: 200,
    alignItems: 'center',
  },
  redirectButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
