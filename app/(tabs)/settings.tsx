import React from 'react';
import { StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { useAuth } from '@/contexts/AuthContext';

export default function Settings() {
  const router = useRouter();
  const { user } = useAuth();

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
        description: 'Manage products and store settings',
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
    ] : []),
  ];

  return (
    <ThemedView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <ThemedView style={styles.header}>
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
              onPress={option.onPress}
            >
              <ThemedView style={styles.optionContent}>
                <ThemedView style={[
                  styles.optionIcon,
                  option.adminOnly && styles.adminOptionIcon
                ]}>
                  <ThemedText style={styles.optionIconText}>{option.icon}</ThemedText>
                </ThemedView>
                <ThemedView style={styles.optionText}>
                  <ThemedText style={styles.optionTitle}>
                    {option.title}
                    {option.adminOnly && <ThemedText style={styles.adminLabel}> (Admin)</ThemedText>}
                  </ThemedText>
                  <ThemedText style={styles.optionDescription}>{option.description}</ThemedText>
                </ThemedView>
                <ThemedText style={styles.chevron}>›</ThemedText>
              </ThemedView>
            </TouchableOpacity>
          ))}
        </ThemedView>
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
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    marginTop: 4,
    textAlign: 'center',
  },
  adminBadge: {
    fontSize: 14,
    color: '#8b5cf6',
    marginTop: 8,
    fontWeight: '600',
  },
  optionsContainer: {
    padding: 16,
  },
  optionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  adminOptionCard: {
    borderWidth: 2,
    borderColor: '#8b5cf6',
    backgroundColor: '#faf5ff',
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  optionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  adminOptionIcon: {
    backgroundColor: '#ede9fe',
  },
  optionIconText: {
    fontSize: 24,
  },
  optionText: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  adminLabel: {
    color: '#8b5cf6',
    fontSize: 12,
    fontWeight: '500',
  },
  optionDescription: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
  chevron: {
    fontSize: 20,
    color: '#6b7280',
    fontWeight: '300',
  },
  logoutButtonText: {
    color: '#fff',
    marginLeft: 8,
    fontWeight: '600',
  },
  logoutButtonDisabled: {
    opacity: 0.6,
  },
});