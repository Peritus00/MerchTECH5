import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export interface ConsentPreferences {
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
  preferences: boolean;
  timestamp: string;
  version: string;
}

class ConsentService {
  private static instance: ConsentService;
  private consentVersion = '1.0';

  static getInstance(): ConsentService {
    if (!ConsentService.instance) {
      ConsentService.instance = new ConsentService();
    }
    return ConsentService.instance;
  }

  async getConsentStatus(): Promise<ConsentPreferences | null> {
    try {
      const consentData = await AsyncStorage.getItem('user_consent_preferences');
      if (consentData) {
        return JSON.parse(consentData);
      }
      return null;
    } catch (error) {
      console.error('Error getting consent status:', error);
      return null;
    }
  }

  async setConsentPreferences(preferences: Partial<ConsentPreferences>): Promise<void> {
    try {
      const currentConsent = await this.getConsentStatus();
      const updatedConsent: ConsentPreferences = {
        necessary: true, // Always true
        analytics: preferences.analytics ?? false,
        marketing: preferences.marketing ?? false,
        preferences: preferences.preferences ?? false,
        timestamp: new Date().toISOString(),
        version: this.consentVersion,
        ...currentConsent,
        ...preferences,
      };

      await AsyncStorage.setItem('user_consent_preferences', JSON.stringify(updatedConsent));
      
      // Apply consent settings
      this.applyConsentSettings(updatedConsent);
      
      console.log('Consent preferences updated:', updatedConsent);
    } catch (error) {
      console.error('Error setting consent preferences:', error);
    }
  }

  async acceptAllConsent(): Promise<void> {
    await this.setConsentPreferences({
      necessary: true,
      analytics: true,
      marketing: true,
      preferences: true,
    });
  }

  async declineAllConsent(): Promise<void> {
    await this.setConsentPreferences({
      necessary: true,
      analytics: false,
      marketing: false,
      preferences: false,
    });
  }

  async hasValidConsent(): Promise<boolean> {
    const consent = await this.getConsentStatus();
    if (!consent) return false;

    // Check if consent is still valid (not older than 1 year)
    const consentDate = new Date(consent.timestamp);
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    return consentDate > oneYearAgo && consent.version === this.consentVersion;
  }

  private applyConsentSettings(consent: ConsentPreferences): void {
    // Apply analytics consent
    if (consent.analytics) {
      this.enableAnalytics();
    } else {
      this.disableAnalytics();
    }

    // Apply marketing consent
    if (consent.marketing) {
      this.enableMarketing();
    } else {
      this.disableMarketing();
    }

    // Apply preferences consent
    if (consent.preferences) {
      this.enablePreferences();
    } else {
      this.disablePreferences();
    }
  }

  private enableAnalytics(): void {
    console.log('Analytics enabled');
    // Integrate with your analytics service
    // Example: Analytics.setEnabled(true);
    
    // For web platform, you can enable Google Analytics, etc.
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      // Enable Google Analytics
      (window as any).gtag?.('consent', 'update', {
        analytics_storage: 'granted'
      });
    }
  }

  private disableAnalytics(): void {
    console.log('Analytics disabled');
    // Disable analytics
    // Example: Analytics.setEnabled(false);
    
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      // Disable Google Analytics
      (window as any).gtag?.('consent', 'update', {
        analytics_storage: 'denied'
      });
    }
  }

  private enableMarketing(): void {
    console.log('Marketing cookies enabled');
    
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      (window as any).gtag?.('consent', 'update', {
        ad_storage: 'granted',
        ad_user_data: 'granted',
        ad_personalization: 'granted'
      });
    }
  }

  private disableMarketing(): void {
    console.log('Marketing cookies disabled');
    
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      (window as any).gtag?.('consent', 'update', {
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied'
      });
    }
  }

  private enablePreferences(): void {
    console.log('Preferences cookies enabled');
    // Enable preference-related functionality
  }

  private disablePreferences(): void {
    console.log('Preferences cookies disabled');
    // Disable preference-related functionality
  }

  // Method to check specific consent
  async hasAnalyticsConsent(): Promise<boolean> {
    const consent = await this.getConsentStatus();
    return consent?.analytics ?? false;
  }

  async hasMarketingConsent(): Promise<boolean> {
    const consent = await this.getConsentStatus();
    return consent?.marketing ?? false;
  }

  async hasPreferencesConsent(): Promise<boolean> {
    const consent = await this.getConsentStatus();
    return consent?.preferences ?? false;
  }

  // Method to clear all consent (for testing or user request)
  async clearConsent(): Promise<void> {
    try {
      await AsyncStorage.removeItem('user_consent_preferences');
      await AsyncStorage.removeItem('user_consent');
      await AsyncStorage.removeItem('consent_timestamp');
      console.log('All consent data cleared');
    } catch (error) {
      console.error('Error clearing consent:', error);
    }
  }
}

export const consentService = ConsentService.getInstance(); 