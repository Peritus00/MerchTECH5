
import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/contexts/AuthContext';

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState(user?.username || '');
  const [email, setEmail] = useState(user?.email || '');
  const [notifications, setNotifications] = useState(true);
  const [analytics, setAnalytics] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      Alert.alert('Success', 'Profile updated successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    console.log('🔴 PROFILE LOGOUT BUTTON PRESSED!');
    console.log('🔴 Profile: Current authentication state:', { user, isAuthenticated: !!user });
    
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { 
          text: 'Cancel', 
          style: 'cancel',
          onPress: () => console.log('🔴 Profile: Logout cancelled by user')
        },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('🔴 Profile: User confirmed logout - starting process...');
              console.log('🔴 Profile: Current user before logout:', JSON.stringify(user, null, 2));
              
              // Call logout and wait for completion
              console.log('🔴 Profile: Calling logout function...');
              await logout();
              console.log('🔴 Profile: Logout function completed');
              
              // Add a small delay to ensure state updates have propagated
              await new Promise(resolve => setTimeout(resolve, 100));
              
              console.log('🔴 Profile: About to navigate to login...');
              router.replace('/auth/login');
              console.log('🔴 Profile: Navigation command sent');
              
              // Log final state after navigation
              setTimeout(() => {
                console.log('🔴 Profile: Final check - current path should be /auth/login');
              }, 500);
              
            } catch (error) {
              console.error('🔴 Profile logout error:', error);
              console.error('🔴 Profile logout error stack:', error.stack);
              Alert.alert('Error', 'Failed to logout. Please try again.');
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container}>
      <ThemedView style={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <ThemedText style={styles.backButton}>← Back</ThemedText>
          </TouchableOpacity>
          <ThemedText type="title">Profile Settings</ThemedText>
        </View>

        <View style={styles.section}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            Account Information
          </ThemedText>
          
          <View style={styles.inputGroup}>
            <ThemedText style={styles.label}>Username</ThemedText>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              placeholder="Enter username"
              placeholderTextColor="#999"
            />
          </View>

          <View style={styles.inputGroup}>
            <ThemedText style={styles.label}>Email</ThemedText>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="Enter email"
              placeholderTextColor="#999"
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.subscriptionInfo}>
            <ThemedText style={styles.label}>Subscription</ThemedText>
            <ThemedText style={styles.subscriptionTier}>
              {user?.subscriptionTier?.toUpperCase() || 'FREE'} Plan
            </ThemedText>
          </View>
        </View>

        <View style={styles.section}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            Preferences
          </ThemedText>
          
          <View style={styles.switchRow}>
            <View style={styles.switchInfo}>
              <ThemedText style={styles.switchLabel}>Push Notifications</ThemedText>
              <ThemedText style={styles.switchDescription}>
                Get notified about QR code scans
              </ThemedText>
            </View>
            <Switch
              value={notifications}
              onValueChange={setNotifications}
            />
          </View>

          <View style={styles.switchRow}>
            <View style={styles.switchInfo}>
              <ThemedText style={styles.switchLabel}>Analytics Tracking</ThemedText>
              <ThemedText style={styles.switchDescription}>
                Help improve our service with usage data
              </ThemedText>
            </View>
            <Switch
              value={analytics}
              onValueChange={setAnalytics}
            />
          </View>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.saveButton, loading && styles.disabled]}
            onPress={handleSave}
            disabled={loading}
          >
            <ThemedText style={styles.saveButtonText}>
              {loading ? 'Saving...' : 'Save Changes'}
            </ThemedText>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
          >
            <ThemedText style={styles.logoutButtonText}>Logout</ThemedText>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <ThemedText style={styles.footerText}>
            Member since {new Date(user?.createdAt || '').toLocaleDateString()}
          </ThemedText>
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
  backButton: {
    color: '#007BFF',
    marginBottom: 16,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d0d0d0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  subscriptionInfo: {
    marginBottom: 16,
  },
  subscriptionTier: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007BFF',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  switchInfo: {
    flex: 1,
    marginRight: 16,
  },
  switchLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  switchDescription: {
    fontSize: 12,
    opacity: 0.7,
    marginTop: 2,
  },
  actions: {
    marginTop: 16,
  },
  saveButton: {
    backgroundColor: '#007BFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  logoutButton: {
    backgroundColor: '#DC3545',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.6,
  },
  footer: {
    alignItems: 'center',
    marginTop: 32,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  footerText: {
    fontSize: 12,
    opacity: 0.7,
  },
});
