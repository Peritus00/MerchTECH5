import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const SESSION_ID_KEY = 'analytics_session_id';
const SESSION_TIMESTAMP_KEY = 'analytics_session_timestamp';
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Generate a unique session ID (UUID v4)
 */
function generateSessionId(): string {
  // Generate UUID v4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Get or create a session ID
 * Session IDs are regenerated after 24 hours
 */
export async function getSessionId(): Promise<string> {
  try {
    const [storedSessionId, storedTimestamp] = await Promise.all([
      AsyncStorage.getItem(SESSION_ID_KEY),
      AsyncStorage.getItem(SESSION_TIMESTAMP_KEY),
    ]);

    const now = Date.now();
    const timestamp = storedTimestamp ? parseInt(storedTimestamp, 10) : 0;
    const isExpired = now - timestamp > SESSION_DURATION_MS;

    // If session exists and is not expired, return it
    if (storedSessionId && !isExpired) {
      return storedSessionId;
    }

    // Generate new session ID
    const newSessionId = generateSessionId();
    await Promise.all([
      AsyncStorage.setItem(SESSION_ID_KEY, newSessionId),
      AsyncStorage.setItem(SESSION_TIMESTAMP_KEY, now.toString()),
    ]);

    console.log('📊 Generated new analytics session ID:', newSessionId);
    return newSessionId;
  } catch (error) {
    console.error('Error managing session ID:', error);
    // Fallback to a temporary session ID
    return `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Clear the current session (useful for testing or logout)
 */
export async function clearSession(): Promise<void> {
  try {
    await Promise.all([
      AsyncStorage.removeItem(SESSION_ID_KEY),
      AsyncStorage.removeItem(SESSION_TIMESTAMP_KEY),
    ]);
    console.log('📊 Analytics session cleared');
  } catch (error) {
    console.error('Error clearing session:', error);
  }
}

/**
 * Get the current session age in milliseconds
 */
export async function getSessionAge(): Promise<number> {
  try {
    const storedTimestamp = await AsyncStorage.getItem(SESSION_TIMESTAMP_KEY);
    if (!storedTimestamp) return 0;
    
    const timestamp = parseInt(storedTimestamp, 10);
    return Date.now() - timestamp;
  } catch (error) {
    console.error('Error getting session age:', error);
    return 0;
  }
}

/**
 * Force regenerate a new session ID
 */
export async function regenerateSession(): Promise<string> {
  await clearSession();
  return getSessionId();
}

