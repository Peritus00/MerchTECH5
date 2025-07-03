import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  Switch,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationContext';

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const { 
    pushNotificationsEnabled, 
    togglePushNotifications, 
    sendTestPushNotification 
  } = useNotifications();
  const router = useRouter();
  const [username, setUsername] = useState(user?.username || '');
  const [email, setEmail] = useState(user?.email || '');
  const [analytics, setAnalytics] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [pushNotificationLoading, setPushNotificationLoading] = useState(false);

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

  const handlePushNotificationToggle = async (enabled: boolean) => {
    if (!user) {
      Alert.alert('Error', 'Please log in to manage notifications');
      return;
    }

    setPushNotificationLoading(true);
    try {
      // Get auth token from AsyncStorage
      const authToken = await AsyncStorage.getItem('authToken');
      if (!authToken) {
        Alert.alert('Error', 'Authentication token not found. Please log in again.');
        setPushNotificationLoading(false);
        return;
      }
      
      const success = await togglePushNotifications(enabled, authToken);
      
      if (success) {
        if (enabled) {
          Alert.alert(
            '📱 Push Notifications Enabled!',
            'You\'ll now receive notifications when customers make purchases.'
          );
        } else {
          Alert.alert('📱 Push Notifications Disabled', 'You won\'t receive push notifications anymore.');
        }
      } else {
        // If the API call failed, the context state should remain unchanged
        // The switch will automatically revert to the previous state
        Alert.alert('Error', 'Failed to update notification settings. Please try again.');
      }
    } catch (error) {
      console.error('Error toggling push notifications:', error);
      // If there's an error, the context state should remain unchanged
      Alert.alert('Error', 'Failed to update notification settings.');
    } finally {
      setPushNotificationLoading(false);
    }
  };



  const handleLogout = () => {
    console.log('🔴 PROFILE LOGOUT BUTTON PRESSED!');
    console.log('🔴 Profile: Current authentication state:', { user, isAuthenticated: !!user });
    console.log('🔴 Profile: Showing logout confirmation dialog...');
    
    setShowLogoutModal(true);
    console.log('🔴 Profile: Logout confirmation dialog displayed');
  };

  const handleLogoutCancel = () => {
    console.log('🔴 Profile: ❌ USER CLICKED CANCEL - LOGOUT CANCELLED');
    console.log('🔴 Profile: User chose to cancel logout operation');
    console.log('🔴 Profile: Remaining logged in...');
    setShowLogoutModal(false);
  };

  const handleLogoutConfirm = async () => {
    try {
      console.log('🔴 Profile: ✅ USER CLICKED LOGOUT - PROCEEDING WITH LOGOUT');
      console.log('🔴 Profile: User confirmed logout - starting process...');
      console.log('🔴 Profile: Current user before logout:', JSON.stringify(user, null, 2));
      console.log('🔴 Profile: isAuthenticated before logout:', !!user);

      setShowLogoutModal(false);

      // Call logout function - AuthContext will handle everything
      console.log('🔴 Profile: Calling logout function...');
      console.log('🔴 Profile: About to call AuthContext.logout()...');
      
      await logout();
      
      console.log('🔴 Profile: Logout function completed successfully');
      console.log('🔴 Profile: AuthContext logout call finished');
      console.log('🔴 Profile: 🎉 LOGOUT PROCESS COMPLETE!');
      
      // Note: Don't check authentication state here since logout immediately 
      // clears the state and navigates away from this component

    } catch (error: any) {
      console.error('🔴 Profile logout error:', error);
      console.error('🔴 Profile logout error details:', {
        message: error?.message || 'Unknown error',
        stack: error?.stack || 'No stack trace',
        name: error?.name || 'Unknown error type'
      });
      Alert.alert('Error', 'Failed to logout. Please try again.');
    }
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
              <ThemedText style={styles.switchLabel}>Sales Push Notifications</ThemedText>
              <ThemedText style={styles.switchDescription}>
                Get notified on your phone when customers make purchases
              </ThemedText>
            </View>
            <Switch
              value={pushNotificationsEnabled}
              onValueChange={handlePushNotificationToggle}
              disabled={pushNotificationLoading}
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
            activeOpacity={0.8}
          >
            <ThemedText style={styles.logoutButtonText}>🚪 Logout</ThemedText>
          </TouchableOpacity>
        </View>

        <View style={styles.footer}>
          <ThemedText style={styles.footerText}>
            Member since {new Date(user?.createdAt || '').toLocaleDateString()}
          </ThemedText>
        </View>
      </ThemedView>

      {/* Custom Logout Confirmation Modal */}
      <Modal
        visible={showLogoutModal}
        transparent={true}
        animationType="fade"
        onRequestClose={handleLogoutCancel}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <ThemedText style={styles.modalTitle}>Confirm Logout</ThemedText>
            <ThemedText style={styles.modalMessage}>
              Are you sure you want to logout? You will need to login again.
            </ThemedText>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={handleLogoutCancel}
              >
                <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={handleLogoutConfirm}
              >
                <ThemedText style={styles.confirmButtonText}>Logout</ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    marginBottom: 8,
    color: '#666',
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
    color: '#333',
  },
  subscriptionInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  subscriptionTier: {
    fontWeight: 'bold',
    color: '#333',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  switchInfo: {
    flex: 1,
  },
  switchLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  switchDescription: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  actions: {
    marginTop: 16,
  },
  saveButton: {
    backgroundColor: '#007BFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  logoutButton: {
    backgroundColor: '#f8d7da',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#721c24',
    fontWeight: 'bold',
    fontSize: 16,
  },
  disabled: {
    opacity: 0.5,
  },
  footer: {
    marginTop: 32,
    alignItems: 'center',
  },
  footerText: {
    color: '#999',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '90%',
    maxWidth: 400,
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    color: '#333',
    lineHeight: 22,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
    marginRight: 8,
  },
  cancelButtonText: {
    color: '#333',
    fontWeight: 'bold',
  },
  confirmButton: {
    backgroundColor: '#d9534f',
    marginLeft: 8,
  },
  confirmButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },

}); 