import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/contexts/AuthContext';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { MerchTechLogo } from '@/components/MerchTechLogo';
import { adminSettingsAPI, settingsAPI } from '@/services/api';
import { MaterialIconWithFallback } from '@/components/MaterialIconWithFallback';

export default function SignupControlScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = useIsAdmin();
  const insets = useSafeAreaInsets();

  const [signupsEnabled, setSignupsEnabled] = useState<boolean>(true);
  const [viewerSignupsEnabled, setViewerSignupsEnabled] = useState<boolean>(false);
  const [viewerUpgradesEnabled, setViewerUpgradesEnabled] = useState<boolean>(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [updatedBy, setUpdatedBy] = useState<number | null>(null);

  useEffect(() => {
    if (!isAdmin) {
      Alert.alert('Access Denied', 'This page is only accessible to administrators.');
      router.back();
      return;
    }
    loadSettings();
  }, [isAdmin]);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const result = await adminSettingsAPI.getSettings();
      
      if (result.settings && result.settings.signups_enabled) {
        setSignupsEnabled(result.settings.signups_enabled.value === 'true');
        setLastUpdated(result.settings.signups_enabled.updatedAt);
        setUpdatedBy(result.settings.signups_enabled.updatedBy);
      }
      if (result.settings?.viewer_signups_enabled) {
        setViewerSignupsEnabled(result.settings.viewer_signups_enabled.value === 'true');
      }
      if (result.settings?.viewer_upgrades_enabled) {
        setViewerUpgradesEnabled(result.settings.viewer_upgrades_enabled.value === 'true');
      }
      if (!result.settings?.signups_enabled) {
        // Fallback to public endpoint if admin endpoint doesn't have the setting
        const publicResult = await settingsAPI.getSignupsEnabled();
        setSignupsEnabled(publicResult.enabled);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      Alert.alert('Error', 'Failed to load signup settings.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (newValue: boolean) => {
    const action = newValue ? 'enable' : 'disable';
    const confirmMessage = `Are you sure you want to ${action} signups? ${
      !newValue 
        ? 'Users will be redirected to the BETA splash page when they try to register.'
        : 'Users will be able to register normally.'
    }`;

    if (Platform.OS === 'web') {
      const confirmed = window.confirm(confirmMessage);
      if (!confirmed) return;
    } else {
      return new Promise<void>((resolve) => {
        Alert.alert(
          `${action === 'enable' ? 'Enable' : 'Disable'} Signups`,
          confirmMessage,
          [
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: () => resolve(),
            },
            {
              text: action === 'enable' ? 'Enable' : 'Disable',
              style: action === 'disable' ? 'destructive' : 'default',
              onPress: async () => {
                await performToggle(newValue);
                resolve();
              },
            },
          ]
        );
      });
    }

    await performToggle(newValue);
  };

  const performToggle = async (newValue: boolean) => {
    try {
      setSaving(true);
      const result = await adminSettingsAPI.toggleSignups(newValue);
      
      setSignupsEnabled(newValue);
      setLastUpdated(new Date().toISOString());
      setUpdatedBy(user?.id || null);
      
      Alert.alert(
        'Success',
        result.message || `Signups ${newValue ? 'enabled' : 'disabled'} successfully.`,
        [{ text: 'OK' }]
      );
    } catch (error: any) {
      console.error('Error toggling signups:', error);
      Alert.alert(
        'Error',
        error.response?.data?.error || 'Failed to update signup settings. Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  const performViewerSignupsToggle = async (newValue: boolean) => {
    try {
      setSaving(true);
      const result = await adminSettingsAPI.toggleViewerSignups(newValue);
      setViewerSignupsEnabled(newValue);
      Alert.alert(
        'Success',
        result.message || `Viewer signups ${newValue ? 'enabled' : 'disabled'} successfully.`,
        [{ text: 'OK' }]
      );
    } catch (error: any) {
      console.error('Error toggling viewer signups:', error);
      Alert.alert(
        'Error',
        error.response?.data?.error || 'Failed to update viewer signup settings. Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  const performViewerUpgradesToggle = async (newValue: boolean) => {
    try {
      setSaving(true);
      const result = await adminSettingsAPI.toggleViewerUpgrades(newValue);
      setViewerUpgradesEnabled(newValue);
      Alert.alert(
        'Success',
        result.message || `Viewer upgrades ${newValue ? 'enabled' : 'disabled'} successfully.`,
        [{ text: 'OK' }]
      );
    } catch (error: any) {
      console.error('Error toggling viewer upgrades:', error);
      Alert.alert(
        'Error',
        error.response?.data?.error || 'Failed to update viewer upgrade settings. Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleViewerSignupsToggle = async (newValue: boolean) => {
    const action = newValue ? 'enable' : 'disable';
    const confirmMessage = `Are you sure you want to ${action} viewer-only signups? ${
      !newValue
        ? 'The viewer registration screen will redirect to the BETA splash page.'
        : 'Users can create watch-only accounts (e.g. from protected content links).'
    }`;

    if (Platform.OS === 'web') {
      const confirmed = window.confirm(confirmMessage);
      if (!confirmed) return;
      await performViewerSignupsToggle(newValue);
      return;
    }

    Alert.alert(
      `${action === 'enable' ? 'Enable' : 'Disable'} viewer signups`,
      confirmMessage,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action === 'enable' ? 'Enable' : 'Disable',
          style: action === 'disable' ? 'destructive' : 'default',
          onPress: () => void performViewerSignupsToggle(newValue),
        },
      ]
    );
  };

  const handleViewerUpgradesToggle = async (newValue: boolean) => {
    const action = newValue ? 'enable' : 'disable';
    const confirmMessage = `Are you sure you want to ${action} viewer upgrades to paid creator plans? ${
      !newValue
        ? 'Viewer accounts cannot start Stripe checkout or switch to the free creator tier until this is turned back on.'
        : 'Viewer accounts can upgrade via subscription checkout or choose the free creator plan.'
    }`;

    if (Platform.OS === 'web') {
      const confirmed = window.confirm(confirmMessage);
      if (!confirmed) return;
      await performViewerUpgradesToggle(newValue);
      return;
    }

    Alert.alert(
      `${action === 'enable' ? 'Enable' : 'Disable'} viewer upgrades`,
      confirmMessage,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action === 'enable' ? 'Enable' : 'Disable',
          style: action === 'disable' ? 'destructive' : 'default',
          onPress: () => void performViewerUpgradesToggle(newValue),
        },
      ]
    );
  };

  if (!isAdmin) {
    return null;
  }

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <ThemedText style={styles.loadingText}>Loading settings...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={[styles.scrollContent, { paddingTop: Math.max(insets.top, 20) }]}
      >
        <View style={styles.header}>
          <MerchTechLogo size="medium" variant="full" style={styles.logo} />
          <ThemedText type="title">Sign-Up Control</ThemedText>
          <ThemedText style={styles.subtitle}>
            Control user registration access
          </ThemedText>
        </View>

        <View style={styles.content}>
          {/* Status Card */}
          <View style={styles.statusCard}>
            <View style={styles.statusHeader}>
              <MaterialIconWithFallback 
                name={signupsEnabled ? 'check-circle' : 'cancel'} 
                size={32} 
                color={signupsEnabled ? '#22c55e' : '#ef4444'} 
              />
              <View style={styles.statusText}>
                <ThemedText style={styles.statusLabel}>Current Status</ThemedText>
                <ThemedText style={[
                  styles.statusValue,
                  { color: signupsEnabled ? '#22c55e' : '#ef4444' }
                ]}>
                  {signupsEnabled ? 'Enabled' : 'Disabled'}
                </ThemedText>
              </View>
            </View>
          </View>

          {/* Toggle Section */}
          <View style={styles.section}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              Sign-Up Control
            </ThemedText>
            
            <View style={styles.toggleContainer}>
              <View style={styles.toggleInfo}>
                <ThemedText style={styles.toggleLabel}>
                  {signupsEnabled ? 'Signups Enabled' : 'Signups Disabled'}
                </ThemedText>
                <ThemedText style={styles.toggleDescription}>
                  {signupsEnabled 
                    ? 'Users can register new accounts normally.'
                    : 'New registrations will be redirected to the BETA splash page.'}
                </ThemedText>
              </View>
              <Switch
                value={signupsEnabled}
                onValueChange={handleToggle}
                disabled={saving}
                trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
                thumbColor={signupsEnabled ? '#3b82f6' : '#9ca3af'}
              />
            </View>
          </View>

          <View style={styles.section}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              Viewer accounts
            </ThemedText>

            <View style={styles.toggleContainer}>
              <View style={styles.toggleInfo}>
                <ThemedText style={styles.toggleLabel}>
                  {viewerSignupsEnabled ? 'Viewer signups on' : 'Viewer signups off'}
                </ThemedText>
                <ThemedText style={styles.toggleDescription}>
                  Separate from creator registration. Use for fans who only need activation-code access.
                </ThemedText>
              </View>
              <Switch
                value={viewerSignupsEnabled}
                onValueChange={handleViewerSignupsToggle}
                disabled={saving}
                trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
                thumbColor={viewerSignupsEnabled ? '#3b82f6' : '#9ca3af'}
              />
            </View>

            <View style={[styles.toggleContainer, { marginTop: 12 }]}>
              <View style={styles.toggleInfo}>
                <ThemedText style={styles.toggleLabel}>
                  {viewerUpgradesEnabled ? 'Viewer upgrades on' : 'Viewer upgrades off'}
                </ThemedText>
                <ThemedText style={styles.toggleDescription}>
                  When off, viewers cannot start paid checkout or convert to the free creator tier from the app.
                </ThemedText>
              </View>
              <Switch
                value={viewerUpgradesEnabled}
                onValueChange={handleViewerUpgradesToggle}
                disabled={saving}
                trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
                thumbColor={viewerUpgradesEnabled ? '#3b82f6' : '#9ca3af'}
              />
            </View>
          </View>

          {/* Information Section */}
          <View style={styles.section}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              Information
            </ThemedText>
            
            <View style={styles.infoCard}>
              <ThemedText style={styles.infoText}>
                When signups are disabled:
              </ThemedText>
              <View style={styles.infoList}>
                <ThemedText style={styles.infoItem}>
                  • Users visiting the registration page will be redirected to the BETA splash page
                </ThemedText>
                <ThemedText style={styles.infoItem}>
                  • The splash page displays a message with contact information
                </ThemedText>
                <ThemedText style={styles.infoItem}>
                  • After 25 seconds, users are automatically redirected to a QR code URL
                </ThemedText>
                <ThemedText style={styles.infoItem}>
                  • Registration API requests will return a 503 error
                </ThemedText>
              </View>
            </View>

            <View style={styles.previewCard}>
              <ThemedText style={styles.previewTitle}>Splash Page Preview</ThemedText>
              <ThemedText style={styles.previewText}>
                "We are currently in BETA please reach out at mymerchtrader@gmail.com if you are interested in participation. Thank You!"
              </ThemedText>
            </View>
          </View>

          {/* Last Updated Info */}
          {lastUpdated && (
            <View style={styles.section}>
              <ThemedText style={styles.lastUpdatedText}>
                Last updated: {new Date(lastUpdated).toLocaleString()}
                {updatedBy && user?.id === updatedBy && ' (by you)'}
              </ThemedText>
            </View>
          )}

          {/* Test Link */}
          <TouchableOpacity
            style={styles.testButton}
            onPress={() => router.push('/auth/beta-splash')}
          >
            <MaterialIconWithFallback name="visibility" size={20} color="#3b82f6" />
            <ThemedText style={styles.testButtonText}>
              Preview Splash Page
            </ThemedText>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#64748b',
  },
  header: {
    padding: 20,
    alignItems: 'center',
  },
  logo: {
    marginBottom: 16,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 16,
    color: '#64748b',
  },
  content: {
    paddingHorizontal: 16,
  },
  statusCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    marginLeft: 16,
    flex: 1,
  },
  statusLabel: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 4,
  },
  statusValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    color: '#1e293b',
  },
  toggleContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  toggleInfo: {
    flex: 1,
    marginRight: 16,
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
    color: '#1e293b',
  },
  toggleDescription: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 20,
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  infoText: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#1e293b',
  },
  infoList: {
    marginLeft: 8,
  },
  infoItem: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 22,
    marginBottom: 8,
  },
  previewCard: {
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#3b82f6',
  },
  previewTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: '#1e293b',
  },
  previewText: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
    fontStyle: 'italic',
  },
  lastUpdatedText: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
  },
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#3b82f6',
  },
  testButtonText: {
    marginLeft: 8,
    color: '#3b82f6',
    fontSize: 16,
    fontWeight: '600',
  },
});
