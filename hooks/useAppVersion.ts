import { useState, useEffect } from 'react';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://merchtech5-production.up.railway.app/api';

interface VersionInfo {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: {
    version: string;
    downloadUrl: string;
    releaseNotes?: string;
    fileSize?: number;
    createdAt: string;
  } | null;
}

const LAST_CHECK_KEY = '@app_version_last_check';
const CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

export function useAppVersion() {
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentVersion = Constants.expoConfig?.version || '1.0.0';
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';

  const checkForUpdates = async (force = false) => {
    try {
      setIsChecking(true);
      setError(null);

      // If forcing, clear cache to ensure fresh data
      if (force) {
        await AsyncStorage.removeItem('@app_version_info');
        await AsyncStorage.removeItem(LAST_CHECK_KEY);
      }

      // Check if we should skip this check (unless forced)
      if (!force) {
        const lastCheck = await AsyncStorage.getItem(LAST_CHECK_KEY);
        if (lastCheck) {
          const lastCheckTime = parseInt(lastCheck, 10);
          const now = Date.now();
          if (now - lastCheckTime < CHECK_INTERVAL) {
            // Too soon to check again, return cached result if available
            const cached = await AsyncStorage.getItem('@app_version_info');
            if (cached) {
              setVersionInfo(JSON.parse(cached));
              setIsChecking(false);
              return;
            }
          }
        }
      }

      console.log('📱 VERSION_CHECK: Checking for updates...');
      console.log('📱 VERSION_CHECK: Current version:', currentVersion);
      console.log('📱 VERSION_CHECK: Platform:', platform);
      console.log('📱 VERSION_CHECK: API URL:', `${API_URL}/app/version/check?currentVersion=${currentVersion}&platform=${platform}`);
      
      const response = await fetch(
        `${API_URL}/app/version/check?currentVersion=${currentVersion}&platform=${platform}`
      );

      if (!response.ok) {
        console.error('❌ VERSION_CHECK: Response not OK:', response.status, response.statusText);
        throw new Error('Failed to check for updates');
      }

      const data: VersionInfo = await response.json();
      console.log('📱 VERSION_CHECK: Response data:', JSON.stringify(data, null, 2));
      console.log('📱 VERSION_CHECK: Update available?', data.updateAvailable);
      console.log('📱 VERSION_CHECK: Latest version:', data.latestVersion?.version);
      
      setVersionInfo(data);

      // Cache the result
      await AsyncStorage.setItem('@app_version_info', JSON.stringify(data));
      await AsyncStorage.setItem(LAST_CHECK_KEY, Date.now().toString());
    } catch (err) {
      console.error('Error checking for app updates:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    // Check for updates on mount
    checkForUpdates();
  }, []);

  return {
    currentVersion,
    platform,
    versionInfo,
    isChecking,
    error,
    checkForUpdates,
  };
}

