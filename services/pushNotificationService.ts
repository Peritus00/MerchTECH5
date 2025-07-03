import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { env } from '@/config/environment';

const API_BASE_URL = env.apiBaseUrl;

interface NotificationSettings {
  salesNotifications: boolean;
  orderNotifications: boolean;
  marketingNotifications: boolean;
}

class PushNotificationService {
  private expoPushToken: string | null = null;
  private notificationListener: any = null;
  private responseListener: any = null;

  constructor() {
    this.setupNotificationHandling();
  }

  // Configure how notifications are handled when app is in foreground
  private setupNotificationHandling() {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  }

  // Request notification permissions
  async requestPermissions(): Promise<boolean> {
    try {
      if (Platform.OS === 'web') {
        console.log('📱 Web platform detected - simulating push notification support for settings');
        return true; // Allow toggle to work on web for settings purposes
      }

      if (!Device.isDevice) {
        console.log('Push notifications only work on physical devices');
        return false;
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('Permission not granted for push notifications');
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error requesting notification permissions:', error);
      return false;
    }
  }

  // Get Expo push token
  async getExpoPushToken(): Promise<string | null> {
    try {
      if (Platform.OS === 'web') {
        console.log('📱 Web platform - using mock token for settings');
        return 'web-mock-token'; // Return a mock token for web
      }

      if (this.expoPushToken) {
        return this.expoPushToken;
      }

      // Check if we have a cached token
      const cachedToken = await AsyncStorage.getItem('expo_push_token');
      if (cachedToken) {
        this.expoPushToken = cachedToken;
        return cachedToken;
      }

      // Request new token
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        return null;
      }

      const token = await Notifications.getExpoPushTokenAsync({
        projectId: env.expoProjectId,
      });

      this.expoPushToken = token.data;
      
      // Cache the token
      await AsyncStorage.setItem('expo_push_token', token.data);
      
      console.log('📱 Expo Push Token:', token.data);
      return token.data;
    } catch (error) {
      console.error('Error getting push token:', error);
      return null;
    }
  }

  // Register push token with server
  async registerTokenWithServer(authToken: string): Promise<boolean> {
    try {
      if (Platform.OS === 'web') {
        console.log('📱 Web platform - skipping token registration (not needed for web)');
        return true; // Return success for web since we don't need actual push tokens
      }

      const pushToken = await this.getExpoPushToken();
      if (!pushToken) {
        console.log('No push token available to register');
        return false;
      }

      const response = await fetch(`${API_BASE_URL}/notifications/register-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          pushToken,
          platform: Platform.OS,
          deviceId: Device.osName || 'unknown',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to register push token');
      }

      console.log('✅ Push token registered with server');
      return true;
    } catch (error) {
      console.error('Error registering push token:', error);
      return false;
    }
  }

  // Update notification settings on server
  async updateNotificationSettings(
    authToken: string, 
    settings: NotificationSettings
  ): Promise<boolean> {
    try {
      console.log('📱 UPDATE: Updating notification settings:', settings);
      console.log('📱 UPDATE: API URL:', `${API_BASE_URL}/notifications/settings`);
      
      const response = await fetch(`${API_BASE_URL}/notifications/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify(settings),
      });

      console.log('📱 UPDATE: Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.log('📱 UPDATE: Error response:', errorText);
        throw new Error(`Failed to update notification settings: ${response.status} - ${errorText}`);
      }

      // Cache settings locally
      await AsyncStorage.setItem('notification_settings', JSON.stringify(settings));
      console.log('📱 UPDATE: Settings cached locally:', settings);
      
      console.log('✅ Notification settings updated successfully');
      return true;
    } catch (error) {
      console.error('📱 UPDATE: Error updating notification settings:', error);
      return false;
    }
  }

  // Get cached notification settings
  async getCachedNotificationSettings(): Promise<NotificationSettings> {
    try {
      const cached = await AsyncStorage.getItem('notification_settings');
      if (cached) {
        console.log('📱 Found cached notification settings:', cached);
        return JSON.parse(cached);
      }
    } catch (error) {
      console.error('Error getting cached notification settings:', error);
    }

    console.log('📱 No cached settings found, using defaults (notifications OFF)');
    // Default settings - start with notifications OFF until user explicitly enables them
    return {
      salesNotifications: false,
      orderNotifications: false,
      marketingNotifications: false,
    };
  }

  // Set up notification listeners
  setupNotificationListeners(
    onNotificationReceived?: (notification: Notifications.Notification) => void,
    onNotificationResponse?: (response: Notifications.NotificationResponse) => void
  ) {
    // Clean up existing listeners
    this.removeNotificationListeners();

    // Listen for notifications received while app is running
    this.notificationListener = Notifications.addNotificationReceivedListener(notification => {
      console.log('📱 Notification received:', notification);
      if (onNotificationReceived) {
        onNotificationReceived(notification);
      }
    });

    // Listen for user interactions with notifications
    this.responseListener = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('📱 Notification response:', response);
      if (onNotificationResponse) {
        onNotificationResponse(response);
      }
    });
  }

  // Remove notification listeners
  removeNotificationListeners() {
    if (this.notificationListener) {
      Notifications.removeNotificationSubscription(this.notificationListener);
      this.notificationListener = null;
    }

    if (this.responseListener) {
      Notifications.removeNotificationSubscription(this.responseListener);
      this.responseListener = null;
    }
  }

  // Send a test notification (for development)
  async sendTestNotification(): Promise<boolean> {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "🛒 New Sale!",
          body: "Test customer just made a purchase of $19.99. Tap to share activation code!",
          sound: 'default',
          priority: Notifications.AndroidNotificationPriority.HIGH,
          vibrate: [0, 250, 250, 250],
          data: {
            type: 'sale',
            customerId: 'test-customer',
            amount: 1999,
            url: 'merchtechapp://purchase-notifications'
          },
        },
        trigger: { seconds: 1 },
      });
      
      console.log('📱 Test notification scheduled');
      return true;
    } catch (error) {
      console.error('Error sending test notification:', error);
      return false;
    }
  }

  // Clear all notifications
  async clearAllNotifications(): Promise<void> {
    try {
      await Notifications.dismissAllNotificationsAsync();
      console.log('📱 All notifications cleared');
    } catch (error) {
      console.error('Error clearing notifications:', error);
    }
  }

  // Get badge count
  async getBadgeCount(): Promise<number> {
    try {
      return await Notifications.getBadgeCountAsync();
    } catch (error) {
      console.error('Error getting badge count:', error);
      return 0;
    }
  }

  // Set badge count
  async setBadgeCount(count: number): Promise<void> {
    try {
      await Notifications.setBadgeCountAsync(count);
    } catch (error) {
      console.error('Error setting badge count:', error);
    }
  }

  // Handle deep linking from notifications
  handleNotificationDeepLink(data: any): string | null {
    if (data.type === 'sale') {
      return '/settings/purchase-notifications';
    }
    
    if (data.url) {
      return data.url.replace('merchtechapp://', '/');
    }
    
    return null;
  }
}

// Export singleton instance
export const pushNotificationService = new PushNotificationService();
export default pushNotificationService; 