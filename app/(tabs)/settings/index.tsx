import React from 'react';
import { StyleSheet, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { useState } from 'react';
import { MaterialIcons } from '@expo/vector-icons'; // Import MaterialIcons
import * as Clipboard from 'expo-clipboard';
import { MerchTechLogo } from '@/components/MerchTechLogo';

export default function Settings() {
  const router = useRouter();
  const { user, logout, isAuthenticated } = useAuth();
  const { unreadCount } = useNotifications();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Check if user is admin (djjetfuel)
  const isAdmin = user && (user.email === 'djjetfuel@gmail.com' || user.username === 'djjetfuel');

  // Debug logging
  console.log('Current user:', user);
  console.log('User email:', user?.email);
  console.log('User username:', user?.username);
  console.log('Is admin check:', isAdmin);

  if (isAdmin) {
    console.log('Adding admin options to settings');
  }

  const handleLogout = async () => {
    console.log('🔴 Settings: LOGOUT FUNCTION CALLED!');
    console.log('🔴 Settings: Current authentication state before logout:', { user, isAuthenticated });
    
    // Use platform-specific confirmation dialog
    let shouldLogout = false;
    
    if (Platform.OS === 'web') {
      shouldLogout = window.confirm('Are you sure you want to logout?');
    } else {
      // Use Alert.alert for mobile platforms
      Alert.alert(
        'Logout',
        'Are you sure you want to logout?',
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => {
              console.log('🔴 Settings: ❌ USER CLICKED CANCEL - LOGOUT CANCELLED');
            }
          },
          {
            text: 'Logout',
            style: 'destructive',
            onPress: async () => {
              await performLogout();
            }
          }
        ]
      );
      return; // Exit early for mobile, the alert will handle the rest
    }
    
    if (shouldLogout) {
      await performLogout();
    } else {
      console.log('🔴 Settings: ❌ USER CLICKED CANCEL - LOGOUT CANCELLED');
    }
  };

  const performLogout = async () => {
    console.log('🔴 Settings: ✅ USER CONFIRMED LOGOUT - PROCEEDING...');
    setIsLoggingOut(true);
    
    try {
      console.log('🔴 Settings: Calling logout function...');
      await logout();
      console.log('🔴 Settings: ✅ Logout function completed successfully');
      console.log('🔴 Settings: 🎉 LOGOUT PROCESS COMPLETE!');
    } catch (error) {
      console.error('🔴 Settings: ❌ Logout failed with error:', error);
      if (Platform.OS === 'web') {
        window.alert('Failed to logout. Please try again.');
      } else {
        Alert.alert('Error', 'Failed to logout. Please try again.');
      }
    } finally {
      setIsLoggingOut(false);
      console.log('🔴 Settings: Logout process finished, isLoggingOut set to false');
    }
  };

  const testEmailDelivery = async () => {
    try {
      const testEmail = 'djkingcake@gmail.com';
      console.log('Testing email delivery to:', testEmail);

      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL || 'https://4311622a-238a-4013-b1eb-c601507a6400-00-3l5qvyow6auc.kirk.replit.dev:5001/api'}/test/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: testEmail,
          testType: 'verification'
        }),
      });

      const result = await response.json();

      if (result.success) {
        Alert.alert(
          'Test Email Sent!',
          `A test email has been sent to ${testEmail}. Please check your inbox (and spam folder).`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'Email Test Failed',
          result.message || 'Failed to send test email',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Email test error:', error);
      Alert.alert('Error', 'Failed to test email delivery');
    }
  };

  const handleHelpSupport = () => {
    if (Platform.OS === 'web') {
      const shouldCopy = window.confirm(
        'For assistance please contact help@merchtech.net\n\nClick OK to copy the email address to your clipboard.'
      );
      if (shouldCopy) {
        navigator.clipboard.writeText('help@merchtech.net').then(() => {
          window.alert('help@merchtech.net copied to clipboard');
        });
      }
    } else {
      Alert.alert(
        'Help & Support',
        'For assistance please contact help@merchtech.net',
        [
          {
            text: 'Copy Email',
            onPress: async () => {
              await Clipboard.setStringAsync('help@merchtech.net');
              Alert.alert('Copied', 'help@merchtech.net has been copied to your clipboard');
            },
          },
          { text: 'Close', style: 'cancel' },
        ]
      );
    }
  };

  const handleAbout = () => {
    const message = 'VERSION 5.1';
    if (Platform.OS === 'web') {
      window.alert(message);
    } else {
      Alert.alert('About', message, [{ text: 'OK' }]);
    }
  };

  const settingsOptions = [
    {
      title: 'Profile',
      description: 'Manage your account information',
      onPress: () => {
        console.log('🔵 SETTINGS: Profile button pressed');
        console.log('🔵 SETTINGS: Navigating to profile page...');
        router.push('/(tabs)/settings/profile');
        console.log('🔵 SETTINGS: Profile navigation command sent');
      },
      icon: '👤',
    },
    {
      title: 'Purchase Notifications',
      description: 'View customer purchases and share activation codes',
      onPress: () => {
        console.log('🔔 SETTINGS: Purchase Notifications button pressed');
        console.log('🔔 SETTINGS: About to navigate to purchase-notifications');
        console.log('🔔 SETTINGS: Current router state:', router);
        router.push('/(tabs)/settings/purchase-notifications');
        console.log('🔔 SETTINGS: Navigation command sent');
      },
      icon: '🔔',
      badgeCount: unreadCount,
    },
    {
      title: 'Subscription',
      description: 'Manage your subscription plan',
      onPress: () => router.push('/subscription'),
      icon: '💳',
    },
    {
      title: 'Help & Support',
      description: 'Get help and contact support',
      onPress: handleHelpSupport,
      icon: '❓',
    },
    {
      title: 'About',
      description: 'VERSION 5.1',
      onPress: handleAbout,
      icon: 'ℹ️',
    },
    {
      title: 'Privacy Policy',
      description: 'View our privacy policy',
      onPress: () => router.push('/legal/privacy'),
      icon: '📜',
    },
    {
      title: 'Terms of Service',
      description: 'View our terms of service',
      onPress: () => router.push('/legal/terms'),
      icon: '⚖️',
    },
    {
      title: 'My Store Manager',
      description: 'Manage the products in your store',
      onPress: () => router.push('/store/manager'),
      icon: '🛠️',
    },
    {
      title: 'My Sales Reports',
      description: 'View and export your store\'s sales data',
      onPress: () => router.push('/store/sales'),
      icon: '📈',
    },

    // Admin-only options
    ...(isAdmin ? [
      {
        title: 'User Permissions',
        description: 'Manage user roles and permissions',
        onPress: () => router.push('/settings/user-permissions'),
        icon: '🔐',
        adminOnly: true,
      },
      {
        title: 'Master Store Manager',
        description: 'Manage all store products and settings',
        onPress: () => router.push('/settings/master-store-manager'),
        icon: '🏪',
        adminOnly: true,
      },
      {
        title: 'Enhanced Sales Reports',
        description: 'View detailed sales analytics',
        onPress: () => router.push('/settings/enhanced-sales-reports'),
        icon: '📈',
        adminOnly: true,
      },
      {
        title: 'Export Data',
        description: 'Download your QR code data',
        onPress: () => console.log('Export data'),
        icon: '📊',
        adminOnly: true,
      },
      {
        title: 'Master Sales Reports',
        description: 'View sales analytics for all products',
        onPress: () => router.push('/settings/master-sales-reports'),
        icon: '📊',
        adminOnly: true,
      },
    ] : []),
    // Logout option at the bottom
    {
      title: 'Logout',
      description: 'Sign out of your account',
      onPress: () => {
        console.log('🔴 Logout option pressed from settingsOptions!');
        handleLogout();
      },
      icon: '🚪',
      isLogout: true,
    },
  ];

  return (
    <ThemedView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <ThemedView style={styles.header}>
          <MerchTechLogo size="medium" variant="full" style={styles.logo} />
          <ThemedText type="title">Settings</ThemedText>
          <ThemedText style={styles.subtitle}>
            Manage your account and preferences
          </ThemedText>
          {isAdmin && (
            <ThemedText style={styles.adminBadge}>
              👑 Admin Access
            </ThemedText>
          )}
        </ThemedView>

        <ThemedView style={styles.optionsContainer}>
          {settingsOptions.map((option, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.optionCard,
                option.adminOnly && styles.adminOptionCard
              ]}
              onPress={() => {
                console.log('🔴 TouchableOpacity pressed for:', option.title);
                if (option.onPress) {
                  option.onPress();
                } else {
                  console.log('❌ No onPress function found for:', option.title);
                }
              }}
              disabled={option.isLogout && isLoggingOut}
            >
              <ThemedView style={styles.optionContent}>
                <ThemedView style={[
                  styles.optionIcon,
                  option.adminOnly && styles.adminOptionIcon
                ]}>
                  <ThemedText style={styles.optionIconText}>{option.icon}</ThemedText>
                  {option.badgeCount && option.badgeCount > 0 && (
                    <ThemedView style={styles.notificationBadge}>
                      <ThemedText style={styles.badgeText}>
                        {option.badgeCount > 99 ? '99+' : option.badgeCount}
                      </ThemedText>
                    </ThemedView>
                  )}
                </ThemedView>
                <ThemedView style={styles.optionText}>
                  <ThemedText style={styles.optionTitle}>
                    {option.title}
                    {option.adminOnly && <ThemedText style={styles.adminLabel}> (Admin)</ThemedText>}
                  </ThemedText>
                  <ThemedText style={styles.optionDescription}>
                    {option.isLogout && isLoggingOut ? 'Signing out...' : option.description}
                  </ThemedText>
                </ThemedView>
                <ThemedText style={styles.chevron}>›</ThemedText>
              </ThemedView>
            </TouchableOpacity>
          ))}
        </ThemedView>

         {/* Test Email Button (for debugging - dev only) */}
         {user?.email === 'djjetfuel@gmail.com' && (
           <TouchableOpacity style={[styles.optionCard, { padding: 16 }]} onPress={testEmailDelivery}>
              <ThemedView style={{ flexDirection: 'row', alignItems: 'center' }}>
                <MaterialIcons name="email" size={24} color="#28a745" style={{ marginRight: 16 }} />
                <ThemedText style={{ fontSize: 16, fontWeight: '600' }}>Test Email Delivery</ThemedText>
              </ThemedView>
            </TouchableOpacity>
         )}
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
  adminBadge: {
    marginTop: 12,
    backgroundColor: 'rgba(236, 252, 241, 1)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 9999,
    color: 'rgba(34, 197, 94, 1)',
    fontWeight: '600',
    fontSize: 12,
  },
  optionsContainer: {
    marginTop: 16,
    paddingHorizontal: 12,
  },
  optionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  adminOptionCard: {
    backgroundColor: '#fffbeb',
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    position: 'relative',
  },
  adminOptionIcon: {
    backgroundColor: '#fef3c7',
  },
  optionIconText: {
    fontSize: 18,
  },
  notificationBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#ff4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  optionText: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  adminLabel: {
    fontSize: 12,
    color: '#d97706',
    fontWeight: 'normal',
  },
  optionDescription: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 2,
  },
  chevron: {
    fontSize: 24,
    color: '#94a3b8',
  },
}); 