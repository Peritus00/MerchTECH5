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
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { adminAPI, profileAPI } from '@/services/api';
import { MaterialIcons } from '@expo/vector-icons';
import { useGoogleSignIn } from '@/hooks/useGoogleSignIn';
import { useAppleSignIn } from '@/hooks/useAppleSignIn';
import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';

interface SearchUser {
  id: number;
  email: string;
  username: string;
  createdAt: string;
  totalScans: number;
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout, refreshUser } = useAuth();
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

  // Admin section state
  const isAdmin = user && (user.email === 'djjetfuel@gmail.com' || user.username === 'djjetfuel' || (user as any).isAdmin);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<SearchUser | null>(null);
  const [userScanDetails, setUserScanDetails] = useState<any>(null);
  const [loadingScans, setLoadingScans] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resettingScans, setResettingScans] = useState(false);
  
  // Social account linking state
  const [linkingProvider, setLinkingProvider] = useState<'google' | 'apple' | null>(null);
  const { signIn: googleSignIn, loading: googleLoading } = useGoogleSignIn();
  const { signIn: appleSignIn, loading: appleLoading } = useAppleSignIn();

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

  // Admin functions
  const handleSearchUsers = async () => {
    if (!searchQuery.trim()) {
      Alert.alert('Error', 'Please enter a search term');
      return;
    }

    setSearchLoading(true);
    try {
      const results = await adminAPI.searchUsers(searchQuery.trim());
      setSearchResults(results);
      if (results.length === 0) {
        Alert.alert('No Results', 'No users found matching your search');
      }
    } catch (error: any) {
      console.error('Error searching users:', error);
      Alert.alert('Error', error.response?.data?.error || 'Failed to search users');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleViewUserScans = async (userId: number) => {
    setLoadingScans(true);
    try {
      const details = await adminAPI.getUserScans(userId);
      setUserScanDetails(details);
      setSelectedUser(searchResults.find(u => u.id === userId) || null);
    } catch (error: any) {
      console.error('Error fetching user scan details:', error);
      Alert.alert('Error', error.response?.data?.error || 'Failed to fetch scan details');
    } finally {
      setLoadingScans(false);
    }
  };

  const handleResetScans = async () => {
    if (!selectedUser) return;

    setResettingScans(true);
    try {
      const result = await adminAPI.resetUserScans(selectedUser.id);
      Alert.alert(
        'Success',
        `Reset ${result.deletedScans} scan(s) for ${result.user.email}`
      );
      setShowResetModal(false);
      setUserScanDetails(null);
      setSelectedUser(null);
      // Refresh search results
      if (searchQuery.trim()) {
        await handleSearchUsers();
      }
    } catch (error: any) {
      console.error('Error resetting scans:', error);
      Alert.alert('Error', error.response?.data?.error || 'Failed to reset scan counts');
    } finally {
      setResettingScans(false);
    }
  };

  // Social account linking handlers
  const handleLinkGoogle = async () => {
    setLinkingProvider('google');
    try {
      const result = await googleSignIn();
      if (result.success) {
        // Refresh user data
        const { refreshUser } = useAuth();
        await refreshUser();
        Alert.alert('Success', 'Google account linked successfully');
      } else {
        Alert.alert('Error', result.error || 'Failed to link Google account');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to link Google account');
    } finally {
      setLinkingProvider(null);
    }
  };

  const handleUnlinkGoogle = async () => {
    setLinkingProvider('google');
    try {
      await profileAPI.unlinkGoogle();
      // Refresh user data
      await refreshUser();
      Alert.alert('Success', 'Google account unlinked successfully');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.error || error.message || 'Failed to unlink Google account');
    } finally {
      setLinkingProvider(null);
    }
  };

  const handleLinkApple = async () => {
    if (Platform.OS !== 'ios') {
      Alert.alert('Error', 'Apple Sign-In is only available on iOS');
      return;
    }

    setLinkingProvider('apple');
    try {
      const isAvailable = await AppleAuthentication.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Error', 'Apple Sign-In is not available on this device');
        return;
      }

      // Generate nonce
      const nonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
      );

      // Request Apple authentication
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce,
      });

      if (!credential.identityToken) {
        Alert.alert('Error', 'No identity token received from Apple');
        return;
      }

      // Link account
      await profileAPI.linkApple(credential.identityToken, nonce);
      
      // Refresh user data
      await refreshUser();
      Alert.alert('Success', 'Apple account linked successfully');
    } catch (error: any) {
      if (error.code === 'ERR_REQUEST_CANCELED') {
        // User cancelled, don't show error
        return;
      }
      Alert.alert('Error', error.message || 'Failed to link Apple account');
    } finally {
      setLinkingProvider(null);
    }
  };

  const handleUnlinkApple = async () => {
    setLinkingProvider('apple');
    try {
      await profileAPI.unlinkApple();
      // Refresh user data
      await refreshUser();
      Alert.alert('Success', 'Apple account unlinked successfully');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.error || error.message || 'Failed to unlink Apple account');
    } finally {
      setLinkingProvider(null);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <ThemedView style={styles.content}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
          <TouchableOpacity 
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
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

        {/* Admin Section */}
        {isAdmin && (
          <View style={styles.section}>
            <ThemedText type="subtitle" style={styles.sectionTitle}>
              Admin Tools
            </ThemedText>
            
            {/* User Search */}
            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>Search Users</ThemedText>
              <View style={styles.searchContainer}>
                <TextInput
                  style={styles.searchInput}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search by email or username"
                  placeholderTextColor="#999"
                  onSubmitEditing={handleSearchUsers}
                />
                <TouchableOpacity
                  style={styles.searchButton}
                  onPress={handleSearchUsers}
                  disabled={searchLoading}
                >
                  {searchLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <MaterialIcons name="search" size={20} color="#fff" />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <View style={styles.resultsContainer}>
                <ThemedText style={styles.resultsTitle}>
                  Search Results ({searchResults.length})
                </ThemedText>
                {searchResults.map((result) => (
                  <View key={result.id} style={styles.resultCard}>
                    <View style={styles.resultInfo}>
                      <ThemedText style={styles.resultEmail}>{result.email}</ThemedText>
                      {result.username && (
                        <ThemedText style={styles.resultUsername}>@{result.username}</ThemedText>
                      )}
                      <ThemedText style={styles.resultScans}>
                        Total Scans: {result.totalScans}
                      </ThemedText>
                    </View>
                    <View style={styles.resultActions}>
                      <TouchableOpacity
                        style={styles.viewButton}
                        onPress={() => handleViewUserScans(result.id)}
                        disabled={loadingScans}
                      >
                        <MaterialIcons name="visibility" size={18} color="#007BFF" />
                        <ThemedText style={styles.viewButtonText}>View</ThemedText>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.resetButton}
                        onPress={() => {
                          setSelectedUser(result);
                          setShowResetModal(true);
                        }}
                      >
                        <MaterialIcons name="refresh" size={18} color="#d9534f" />
                        <ThemedText style={styles.resetButtonText}>Reset</ThemedText>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* User Scan Details */}
            {userScanDetails && selectedUser && (
              <View style={styles.scanDetailsContainer}>
                <View style={styles.scanDetailsHeader}>
                  <ThemedText type="subtitle" style={styles.scanDetailsTitle}>
                    Scan Details: {selectedUser.email}
                  </ThemedText>
                  <TouchableOpacity
                    onPress={() => {
                      setUserScanDetails(null);
                      setSelectedUser(null);
                    }}
                  >
                    <MaterialIcons name="close" size={24} color="#666" />
                  </TouchableOpacity>
                </View>
                
                <View style={styles.scanStats}>
                  <ThemedText style={styles.scanStatLabel}>Total Scans:</ThemedText>
                  <ThemedText style={styles.scanStatValue}>
                    {userScanDetails.totalScans}
                  </ThemedText>
                </View>

                {userScanDetails.qrCodeBreakdown && userScanDetails.qrCodeBreakdown.length > 0 && (
                  <View style={styles.qrBreakdown}>
                    <ThemedText style={styles.breakdownTitle}>By QR Code:</ThemedText>
                    {userScanDetails.qrCodeBreakdown.map((qr: any) => (
                      <View key={qr.qrCodeId} style={styles.qrBreakdownItem}>
                        <ThemedText style={styles.qrBreakdownName}>{qr.qrCodeName}</ThemedText>
                        <ThemedText style={styles.qrBreakdownCount}>
                          {qr.scanCount} scan{qr.scanCount !== 1 ? 's' : ''}
                        </ThemedText>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>
        )}

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

      {/* Reset Scans Confirmation Modal */}
      {isAdmin && (
        <Modal
          visible={showResetModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowResetModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContainer}>
              <ThemedText style={styles.modalTitle}>Reset Scan Counts</ThemedText>
              <ThemedText style={styles.modalMessage}>
                Are you sure you want to reset all scan counts for {selectedUser?.email}?
                This will delete {selectedUser?.totalScans || 0} scan record{selectedUser?.totalScans !== 1 ? 's' : ''} and cannot be undone.
              </ThemedText>
              
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => setShowResetModal(false)}
                  disabled={resettingScans}
                >
                  <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.modalButton, styles.confirmButton]}
                  onPress={handleResetScans}
                  disabled={resettingScans}
                >
                  {resettingScans ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <ThemedText style={styles.confirmButtonText}>Reset</ThemedText>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
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
  // Admin section styles
  searchContainer: {
    flexDirection: 'row',
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
    color: '#333',
    marginRight: 8,
  },
  searchButton: {
    backgroundColor: '#007BFF',
    borderRadius: 8,
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 50,
  },
  resultsContainer: {
    marginTop: 16,
  },
  resultsTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#333',
  },
  resultCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  resultInfo: {
    marginBottom: 8,
  },
  resultEmail: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  resultUsername: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  resultScans: {
    fontSize: 14,
    color: '#007BFF',
    fontWeight: '500',
  },
  resultActions: {
    flexDirection: 'row',
    marginTop: 8,
  },
  viewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#007BFF',
    marginRight: 8,
  },
  viewButtonText: {
    color: '#007BFF',
    fontSize: 14,
    fontWeight: '500',
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#d9534f',
  },
  resetButtonText: {
    color: '#d9534f',
    fontSize: 14,
    fontWeight: '500',
  },
  scanDetailsContainer: {
    marginTop: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  scanDetailsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  scanDetailsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  scanStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    marginBottom: 12,
  },
  scanStatLabel: {
    fontSize: 16,
    color: '#666',
  },
  scanStatValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#007BFF',
  },
  qrBreakdown: {
    marginTop: 8,
  },
  breakdownTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  qrBreakdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    borderRadius: 6,
    marginBottom: 4,
  },
  qrBreakdownName: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  qrBreakdownCount: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  // Connected accounts styles
  accountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  accountInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  accountDetails: {
    marginLeft: 12,
  },
  accountLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  accountStatus: {
    fontSize: 14,
    color: '#666',
  },
  linkButton: {
    backgroundColor: '#007BFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    minWidth: 80,
    alignItems: 'center',
  },
  linkButtonText: {
    color: '#fff',
    fontWeight: '500',
    fontSize: 14,
  },
  unlinkButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#d9534f',
    minWidth: 80,
    alignItems: 'center',
  },
  unlinkButtonText: {
    color: '#d9534f',
    fontWeight: '500',
    fontSize: 14,
  },
}); 