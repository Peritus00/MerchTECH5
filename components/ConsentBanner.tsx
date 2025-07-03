import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Linking } from 'react-native';
import { consentService } from '@/services/consentService';

interface ConsentBannerProps {
  onConsentGiven?: (consent: boolean) => void;
}

export const ConsentBanner: React.FC<ConsentBannerProps> = ({ onConsentGiven }) => {
  const [showBanner, setShowBanner] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkConsentStatus();
    
    // Load Termly script for web platform
    if (Platform.OS === 'web') {
      loadTermlyScript();
    }
  }, []);

  const checkConsentStatus = async () => {
    try {
      const hasValidConsent = await consentService.hasValidConsent();
      if (!hasValidConsent) {
        setShowBanner(true);
      }
    } catch (error) {
      console.error('Error checking consent status:', error);
      setShowBanner(true);
    } finally {
      setIsLoading(false);
    }
  };

  const loadTermlyScript = () => {
    // Only load on web platform
    if (Platform.OS !== 'web') return;

    try {
      // Check if script is already loaded
      const existingScript = document.querySelector('script[src*="termly.io"]');
      if (existingScript) return;

      const script = document.createElement('script');
      script.src = 'https://app.termly.io/resource-blocker/0a3f7eee-d48f-45b0-b48b-60a5a1161ff3?autoBlock=on';
      script.async = true;
      script.onload = () => {
        console.log('Termly script loaded successfully');
        // Hide our custom banner since Termly will handle it
        setShowBanner(false);
      };
      script.onerror = () => {
        console.error('Failed to load Termly script');
        // Show our fallback banner
        setShowBanner(true);
      };
      
      document.head.appendChild(script);
    } catch (error) {
      console.error('Error loading Termly script:', error);
      setShowBanner(true);
    }
  };

  const handleAccept = async () => {
    try {
      await consentService.acceptAllConsent();
      setShowBanner(false);
      onConsentGiven?.(true);
    } catch (error) {
      console.error('Error saving consent:', error);
    }
  };

  const handleDecline = async () => {
    try {
      await consentService.declineAllConsent();
      setShowBanner(false);
      onConsentGiven?.(false);
    } catch (error) {
      console.error('Error saving consent:', error);
    }
  };

  const openPrivacyPolicy = () => {
    // Use your app's privacy policy route
    if (Platform.OS === 'web') {
      window.open('/legal/privacy', '_blank');
    } else {
      // For mobile, you might want to navigate within the app
      Linking.openURL('https://your-domain.com/legal/privacy');
    }
  };

  // Don't show banner while loading or if consent already given
  if (isLoading || !showBanner) {
    return null;
  }

  // For web, Termly script should handle the banner
  // This fallback banner is for mobile or if Termly fails to load
  return (
    <View style={styles.bannerContainer}>
      <View style={styles.banner}>
        <View style={styles.content}>
          <Text style={styles.title}>🍪 Cookie Consent</Text>
          <Text style={styles.description}>
            We use cookies and similar technologies to enhance your experience, analyze traffic, and personalize content. 
            By continuing to use MerchTech, you consent to our use of cookies.
          </Text>
          
          <TouchableOpacity onPress={openPrivacyPolicy} style={styles.linkButton}>
            <Text style={styles.linkText}>View Privacy Policy</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.buttonContainer}>
          <TouchableOpacity onPress={handleDecline} style={[styles.button, styles.declineButton]}>
            <Text style={styles.declineButtonText}>Decline</Text>
          </TouchableOpacity>
          
          <TouchableOpacity onPress={handleAccept} style={[styles.button, styles.acceptButton]}>
            <Text style={styles.acceptButtonText}>Accept All</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  bannerContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  banner: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  content: {
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
    marginBottom: 12,
  },
  linkButton: {
    alignSelf: 'flex-start',
  },
  linkText: {
    fontSize: 14,
    color: '#3b82f6',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  acceptButton: {
    backgroundColor: '#10b981',
  },
  declineButton: {
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  acceptButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  declineButtonText: {
    color: '#6b7280',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ConsentBanner; 