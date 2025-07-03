import React, { createContext, useContext, useState, useEffect } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import pushNotificationService from '@/services/pushNotificationService';
import * as Notifications from 'expo-notifications';

interface PurchaseNotification {
  id: string;
  customerId: string;
  customerEmail?: string;
  customerName?: string;
  products: Array<{
    id: string;
    name: string;
    price: number;
    quantity: number;
  }>;
  total: number;
  timestamp: string;
  activationCodeShared?: boolean;
}

interface NotificationContextType {
  notifications: PurchaseNotification[];
  unreadCount: number;
  pushNotificationsEnabled: boolean;
  addNotification: (notification: PurchaseNotification) => void;
  markAsRead: (notificationId: string) => void;
  markActivationCodeShared: (notificationId: string) => void;
  clearNotifications: () => void;
  loadNotifications: () => Promise<void>;
  initializePushNotifications: (authToken: string) => Promise<boolean>;
  togglePushNotifications: (enabled: boolean, authToken: string) => Promise<boolean>;
  sendTestPushNotification: () => Promise<boolean>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  console.log('🔔 NOTIFICATION CONTEXT: Provider initializing');
  
  const [notifications, setNotifications] = useState<PurchaseNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pushNotificationsEnabled, setPushNotificationsEnabled] = useState(false);
  
  console.log('🔔 NOTIFICATION CONTEXT: State initialized, notifications count:', notifications.length);

  // Load notifications from storage on app start
  useEffect(() => {
    loadNotifications();
    loadPushNotificationSettings();
    setupPushNotificationListeners();
    
    return () => {
      pushNotificationService.removeNotificationListeners();
    };
  }, []);

  // Calculate unread count whenever notifications change
  useEffect(() => {
    const unread = notifications.filter(n => !n.activationCodeShared).length;
    setUnreadCount(unread);
    
    // Update badge count
    pushNotificationService.setBadgeCount(unread);
  }, [notifications]);

  const loadPushNotificationSettings = async () => {
    try {
      console.log('🔔 LOAD: Loading push notification settings...');
      const settings = await pushNotificationService.getCachedNotificationSettings();
      console.log('🔔 LOAD: Cached settings:', settings);
      console.log('🔔 LOAD: Setting pushNotificationsEnabled to:', settings.salesNotifications);
      setPushNotificationsEnabled(settings.salesNotifications);
    } catch (error) {
      console.error('🔔 LOAD: Error loading push notification settings:', error);
    }
  };

  const setupPushNotificationListeners = () => {
    pushNotificationService.setupNotificationListeners(
      // On notification received
      (notification) => {
        console.log('📱 Push notification received:', notification);
      },
      
      // On notification response (user tapped notification)
      (response) => {
        console.log('📱 Push notification response:', response);
        const data = response.notification.request.content.data;
        
        if (data?.type === 'sale') {
          // Handle navigation to purchase notifications
          // This will be handled by the app's deep linking system
          console.log('📱 User tapped sale notification');
        }
      }
    );
  };

  const loadNotifications = async () => {
    try {
      const stored = await AsyncStorage.getItem('purchase_notifications');
      if (stored) {
        const parsed = JSON.parse(stored);
        setNotifications(parsed);
      }
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  };

  const saveNotifications = async (notifs: PurchaseNotification[]) => {
    try {
      await AsyncStorage.setItem('purchase_notifications', JSON.stringify(notifs));
    } catch (error) {
      console.error('Error saving notifications:', error);
    }
  };

  const addNotification = (notification: PurchaseNotification) => {
    setNotifications(prev => {
      const updated = [notification, ...prev];
      saveNotifications(updated);
      return updated;
    });

    // Show alert for new purchase
    Alert.alert(
      '🛒 New Purchase!',
      `Customer ${notification.customerEmail || 'Unknown'} just made a purchase of $${(notification.total / 100).toFixed(2)}. Tap to share an activation code!`,
      [
        { text: 'Later', style: 'cancel' },
        { text: 'Share Code', onPress: () => {
          // This could trigger navigation to the activation codes page
          console.log('Navigate to share activation code for notification:', notification.id);
        }}
      ]
    );
  };

  const markAsRead = (notificationId: string) => {
    setNotifications(prev => {
      const updated = prev.map(n => 
        n.id === notificationId ? { ...n, read: true } : n
      );
      saveNotifications(updated);
      return updated;
    });
  };

  const markActivationCodeShared = (notificationId: string) => {
    setNotifications(prev => {
      const updated = prev.map(n => 
        n.id === notificationId ? { ...n, activationCodeShared: true } : n
      );
      saveNotifications(updated);
      return updated;
    });
  };

  const clearNotifications = () => {
    setNotifications([]);
    saveNotifications([]);
  };

  const initializePushNotifications = async (authToken: string): Promise<boolean> => {
    try {
      console.log('🔔 Initializing push notifications...');
      
      // Request permissions and get token
      const hasPermission = await pushNotificationService.requestPermissions();
      if (!hasPermission) {
        console.log('❌ Push notification permissions denied');
        return false;
      }

      // Register token with server
      const registered = await pushNotificationService.registerTokenWithServer(authToken);
      if (!registered) {
        console.log('❌ Failed to register push token with server');
        return false;
      }

      // Update local state
      setPushNotificationsEnabled(true);
      
      // Update server settings
      await pushNotificationService.updateNotificationSettings(authToken, {
        salesNotifications: true,
        orderNotifications: true,
        marketingNotifications: false,
      });

      console.log('✅ Push notifications initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Error initializing push notifications:', error);
      return false;
    }
  };

  const togglePushNotifications = async (enabled: boolean, authToken: string): Promise<boolean> => {
    try {
      console.log('🔔 TOGGLE: Starting toggle, enabled:', enabled, 'current state:', pushNotificationsEnabled);
      
      if (enabled) {
        console.log('🔔 TOGGLE: Enabling notifications...');
        const success = await initializePushNotifications(authToken);
        console.log('🔔 TOGGLE: Enable result:', success);
        return success;
      } else {
        console.log('🔔 TOGGLE: Disabling notifications...');
        // Disable notifications
        const success = await pushNotificationService.updateNotificationSettings(authToken, {
          salesNotifications: false,
          orderNotifications: false,
          marketingNotifications: false,
        });
        
        if (success) {
          setPushNotificationsEnabled(false);
          console.log('🔔 TOGGLE: Disabled successfully, new state should be false');
          return true;
        } else {
          console.log('🔔 TOGGLE: Failed to disable notifications');
          return false;
        }
      }
    } catch (error) {
      console.error('🔔 TOGGLE: Error toggling push notifications:', error);
      return false;
    }
  };

  const sendTestPushNotification = async (): Promise<boolean> => {
    try {
      const success = await pushNotificationService.sendTestNotification();
      if (success) {
        Alert.alert(
          '📱 Test Notification Sent!',
          'Check your device for the test notification.'
        );
      }
      return success;
    } catch (error) {
      console.error('Error sending test notification:', error);
      return false;
    }
  };

  const value: NotificationContextType = {
    notifications,
    unreadCount,
    pushNotificationsEnabled,
    addNotification,
    markAsRead,
    markActivationCodeShared,
    clearNotifications,
    loadNotifications,
    initializePushNotifications,
    togglePushNotifications,
    sendTestPushNotification,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  console.log('🔔 USE NOTIFICATIONS HOOK: Being called');
  
  const context = useContext(NotificationContext);
  console.log('🔔 USE NOTIFICATIONS HOOK: Context value:', context ? 'found' : 'undefined');
  
  if (context === undefined) {
    console.error('🔔 USE NOTIFICATIONS HOOK: ❌ Context is undefined! NotificationProvider not found');
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  
  console.log('🔔 USE NOTIFICATIONS HOOK: ✅ Context found, notifications count:', context.notifications?.length || 0);
  return context;
}; 