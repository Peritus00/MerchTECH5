import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/contexts/AuthContext';

export default function SettingsScreen() {
  const { user } = useAuth();
  const router = useRouter();

  // Debug: log user data to see what we're working with
  console.log('Current user:', user);
  console.log('User email:', user?.email);
  console.log('User username:', user?.username);

  const settingsOptions = [
    {
      title: 'Profile',
      description: 'Manage your account information',
      onPress: () => router.push('/settings/profile'),
      icon: '👤',
    },
    {
      title: 'Notifications',
      description: 'Configure notification preferences',
      onPress: () => console.log('Navigate to notifications'),
      icon: '🔔',
    },
    {
      title: 'Subscription',
      description: 'Manage your subscription plan',
      onPress: () => router.push('/subscription'),
      icon: '💳',
    },
    {
      title: 'Export Data',
      description: 'Download your QR code data',
      onPress: () => console.log('Export data'),
      icon: '📊',
    },
    {
      title: 'Help & Support',
      description: 'Get help and contact support',
      onPress: () => console.log('Navigate to help'),
      icon: '❓',
    },
    {
      title: 'About',
      description: 'App version and information',
      onPress: () => console.log('Navigate to about'),
      icon: 'ℹ️',
    },
  ];

  // Add user permissions setting for djjetfuel user (check both email and username)
  const isDeveloper = user?.email === 'djjetfuel@gmail.com' || 
                     user?.username === 'djjetfuel' ||
                     user?.email?.includes('djjetfuel');
  
  console.log('Is developer check:', isDeveloper);
  console.log('User object full:', JSON.stringify(user, null, 2));
  
  if (isDeveloper) {
    console.log('Adding User Permissions option to settings');
    settingsOptions.push({
      title: 'User Permissions',
      description: 'Manage user roles and permissions',
      onPress: () => {
        console.log('Navigating to user permissions');
        router.push('/settings/user-permissions');
      },
      icon: '🛡️',
    });
  } else {
    console.log('User is not a developer, not showing User Permissions');
  }

  return (
    <ScrollView style={styles.container}>
      <ThemedView style={styles.content}>
        <View style={styles.header}>
          <ThemedText type="title">Settings</ThemedText>
          {user && (
            <View style={styles.userInfo}>
              <ThemedText type="subtitle">{user.username}</ThemedText>
              <ThemedText style={styles.userEmail}>{user.email}</ThemedText>
            </View>
          )}
        </View>

        <View style={styles.optionsList}>
          {settingsOptions.map((option, index) => (
            <TouchableOpacity
              key={index}
              style={styles.optionItem}
              onPress={option.onPress}
            >
              <View style={styles.optionIcon}>
                <ThemedText style={styles.iconText}>{option.icon}</ThemedText>
              </View>
              <View style={styles.optionContent}>
                <ThemedText type="defaultSemiBold" style={styles.optionTitle}>
                  {option.title}
                </ThemedText>
                <ThemedText style={styles.optionDescription}>
                  {option.description}
                </ThemedText>
              </View>
              <ThemedText style={styles.chevron}>›</ThemedText>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.footer}>
          <ThemedText style={styles.version}>Version 1.0.0</ThemedText>
          <ThemedText style={styles.copyright}>© 2024 MerchTech</ThemedText>
        </View>
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  header: {
    marginBottom: 32,
  },
  userInfo: {
    marginTop: 16,
    padding: 16,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 8,
  },
  userEmail: {
    fontSize: 14,
    opacity: 0.7,
    marginTop: 4,
  },
  optionsList: {
    marginBottom: 32,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  iconText: {
    fontSize: 20,
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    marginBottom: 2,
  },
  optionDescription: {
    fontSize: 12,
    opacity: 0.7,
  },
  chevron: {
    fontSize: 20,
    opacity: 0.5,
  },
  footer: {
    alignItems: 'center',
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  version: {
    fontSize: 12,
    opacity: 0.7,
  },
  copyright: {
    fontSize: 12,
    opacity: 0.7,
    marginTop: 4,
  },
});