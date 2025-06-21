import React from 'react';
import { StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { MaterialIcons } from '@expo/vector-icons';

function SettingsPage({ user }) {
  const router = useRouter();

  const settingsOptions = [
    {
      title: 'Profile Settings',
      subtitle: 'Manage your account information',
      icon: 'person',
      route: '/settings/profile',
    },
    {
      title: 'User Permissions',
      subtitle: 'Manage user access and permissions',
      icon: 'security',
      route: '/settings/user-permissions',
      adminOnly: true,
    },
    {
      title: 'Master Store Manager',
      subtitle: 'Manage products and store settings',
      icon: 'store',
      route: '/settings/master-store-manager',
      adminOnly: true,
    },
    {
      title: 'Enhanced Sales Reports',
      subtitle: 'View detailed sales analytics',
      icon: 'analytics',
      route: '/settings/enhanced-sales-reports',
      adminOnly: true,
    },
  ];

  const filteredOptions = settingsOptions.filter(
    option => !option.adminOnly || (user && user.isAdmin)
  );

  return (
    <ThemedView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <ThemedView style={styles.header}>
          <ThemedText type="title">Settings</ThemedText>
          <ThemedText style={styles.subtitle}>Manage your account and preferences</ThemedText>
        </ThemedView>

        <ThemedView style={styles.optionsContainer}>
          {filteredOptions.map((option, index) => (
            <TouchableOpacity
              key={index}
              style={styles.optionCard}
              onPress={() => router.push(option.route)}
            >
              <ThemedView style={styles.optionContent}>
                <ThemedView style={styles.optionIcon}>
                  <MaterialIcons name={option.icon as any} size={24} color="#8b5cf6" />
                </ThemedView>
                <ThemedView style={styles.optionText}>
                  <ThemedText style={styles.optionTitle}>{option.title}</ThemedText>
                  <ThemedText style={styles.optionSubtitle}>{option.subtitle}</ThemedText>
                </ThemedView>
                <MaterialIcons name="chevron-right" size={24} color="#6b7280" />
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
  optionText: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  optionSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
});

export default SettingsPage;