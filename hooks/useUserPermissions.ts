
import { useState, useEffect } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface UserPermissions {
  id: number | string;
  username: string;
  email: string;
  subscriptionTier: 'free' | 'basic' | 'premium';
  isAdmin: boolean;
  canViewAnalytics: boolean;
  canManagePlaylists: boolean;
  canEditPlaylists: boolean;
  canUploadMedia: boolean;
  canGenerateCodes: boolean;
  canAccessStore: boolean;
  canViewFanmail: boolean;
  canManageQRCodes: boolean;
  maxPlaylists: number;
  maxVideos: number;
  maxAudioFiles: number;
  maxActivationCodes: number;
  maxProducts: number;
  maxQrCodes: number;
  maxSlideshows: number;
  isSuspended: boolean;
  createdAt: string;
  lastActive: string;
  isPending?: boolean;
}

interface UseUserPermissionsResult {
  users: UserPermissions[];
  isLoading: boolean;
  refreshUsers: () => Promise<void>;
  updateUserPermissions: (userId: number, permissions: Partial<UserPermissions>) => Promise<boolean>;
  deleteUser: (userId: number | string) => Promise<boolean>;
}

export const useUserPermissions = (): UseUserPermissionsResult => {
  const [users, setUsers] = useState<UserPermissions[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Get the current domain and construct the API URL properly
  const getApiUrl = () => {
    if (process.env.EXPO_PUBLIC_API_URL) {
      return process.env.EXPO_PUBLIC_API_URL;
    }
    
    // For Replit environment
    if (typeof window !== 'undefined' && window.location) {
      const hostname = window.location.hostname;
      if (hostname.includes('replit.dev')) {
        // Use the same hostname without port for API calls in Replit
        return `${window.location.protocol}//${hostname}/api`;
      }
      return `${window.location.protocol}//${hostname}:5000/api`;
    }
    
    return 'http://localhost:5000/api';
  };

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const token = await AsyncStorage.getItem('authToken');
      console.log('Fetching users with token:', token ? 'Present' : 'Missing');
      
      const apiUrl = `${getApiUrl()}/admin/all-users`;
      console.log('API URL:', apiUrl);
      
      if (!token) {
        console.error('No auth token found');
        throw new Error('Authentication required');
      }
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('Response status:', response.status);
      console.log('Response headers:', response.headers);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Raw user data received:', data);
        console.log('Number of users:', Array.isArray(data) ? data.length : 'Not an array');
        
        // Transform the API data to match our UserPermissions interface
        const transformedUsers: UserPermissions[] = data.map((user: any) => {
          // Use the correct field names from the API response
          const subscriptionTier = user.subscriptionTier || user.subscription_tier || 'free';
          const isPending = user.isPending || user.status === 'pending' || false;
          
          return {
            id: user.id,
            username: user.username || user.email?.split('@')[0] || 'Unknown',
            email: user.email,
            subscriptionTier: subscriptionTier as 'free' | 'basic' | 'premium',
            isAdmin: user.isAdmin || user.is_admin || false,
            canViewAnalytics: subscriptionTier === 'premium',
            canManagePlaylists: true,
            canEditPlaylists: subscriptionTier !== 'free',
            canUploadMedia: true,
            canGenerateCodes: subscriptionTier !== 'free',
            canAccessStore: true,
            canViewFanmail: subscriptionTier === 'premium',
            canManageQRCodes: true,
            maxPlaylists: subscriptionTier === 'premium' ? 999 : subscriptionTier === 'basic' ? 25 : 5,
            maxVideos: subscriptionTier === 'premium' ? 999 : subscriptionTier === 'basic' ? 100 : 10,
            maxAudioFiles: subscriptionTier === 'premium' ? 999 : subscriptionTier === 'basic' ? 100 : 10,
            maxActivationCodes: subscriptionTier === 'premium' ? 999 : subscriptionTier === 'basic' ? 25 : 10,
            maxProducts: subscriptionTier === 'premium' ? 999 : subscriptionTier === 'basic' ? 15 : 5,
            maxQrCodes: subscriptionTier === 'premium' ? 999 : subscriptionTier === 'basic' ? 50 : 10,
            maxSlideshows: subscriptionTier === 'premium' ? 999 : subscriptionTier === 'basic' ? 10 : 3,
            isSuspended: user.isSuspended || false,
            createdAt: user.createdAt || user.created_at,
            lastActive: user.updatedAt || user.updated_at || user.createdAt || user.created_at,
            isPending: isPending
          };
        });
        
        console.log('Transformed users:', transformedUsers);
        setUsers(transformedUsers);
      } else {
        const errorText = await response.text();
        console.error('API Error response:', errorText);
        throw new Error(`API Error: ${response.status} - ${errorText}`);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        apiUrl: `${getApiUrl()}/admin/all-users`
      });
      
      // Don't show alert for network errors, just log them
      if (error.message?.includes('Network Error') || error.message?.includes('fetch') || error.message?.includes('TypeError')) {
        console.log('Network connectivity issue - users list will be empty');
      } else {
        Alert.alert('Error', `Failed to load users: ${error.message}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const updateUserPermissions = async (
    userId: number,
    permissions: Partial<UserPermissions>
  ): Promise<boolean> => {
    try {
      // Mock update for development
      setUsers(prev =>
        prev.map(user =>
          user.id === userId ? { ...user, ...permissions } : user
        )
      );
      Alert.alert('Success', 'User permissions updated successfully');
      return true;

      // Uncomment for real API integration:
      // const response = await fetch(`http://0.0.0.0:5000/api/admin/users/${userId}/permissions`, {
      //   method: 'PATCH',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(permissions),
      // });
      // 
      // if (response.ok) {
      //   const updatedUser = await response.json();
      //   setUsers(prev =>
      //     prev.map(user =>
      //       user.id === userId ? { ...user, ...updatedUser.user } : user
      //     )
      //   );
      //   Alert.alert('Success', 'User permissions updated successfully');
      //   return true;
      // } else {
      //   const error = await response.json();
      //   Alert.alert('Error', error.message || 'Failed to update permissions');
      //   return false;
      // }
    } catch (error) {
      console.error('Error updating permissions:', error);
      Alert.alert('Error', 'Failed to update permissions');
      return false;
    }
  };

  const deleteUser = async (userId: number | string): Promise<boolean> => {
    console.log('=== DELETE USER FUNCTION CALLED ===');
    console.log('User ID to delete:', userId, 'Type:', typeof userId);
    
    try {
      const token = await AsyncStorage.getItem('authToken');
      console.log('Auth token available:', !!token);
      
      if (!token) {
        console.error('No auth token found');
        Alert.alert('Error', 'Authentication required');
        return false;
      }
      
      // Handle pending user IDs (format: "pending_123")
      let actualUserId = userId;
      if (typeof userId === 'string' && userId.startsWith('pending_')) {
        actualUserId = userId.replace('pending_', '');
        console.log('Converted pending user ID:', actualUserId);
      }
      
      console.log('Final user ID for API call:', actualUserId);
      
      const apiUrl = `${getApiUrl()}/admin/users/${actualUserId}`;
      console.log('Delete API URL:', apiUrl);
      
      console.log('Making DELETE request...');
      const response = await fetch(apiUrl, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('Delete response status:', response.status);
      console.log('Delete response ok:', response.ok);
      
      if (response.ok) {
        console.log('Delete successful - updating local state');
        // Remove from local state using the original userId (which might be a string)
        setUsers(prev => {
          const before = prev.length;
          const filteredUsers = prev.filter(u => u.id !== userId);
          const after = filteredUsers.length;
          console.log(`Users before deletion: ${before}, after: ${after}`);
          console.log('Removed user with ID:', userId);
          return filteredUsers;
        });
        
        console.log('User deleted successfully from state');
        return true;
      } else {
        const errorText = await response.text();
        console.error('Delete error response:', errorText);
        console.error('Response status:', response.status);
        
        let errorMessage = 'Failed to delete user';
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorJson.message || errorMessage;
        } catch (e) {
          console.log('Could not parse error response as JSON');
          errorMessage = errorText || errorMessage;
        }
        
        console.error('Final error message:', errorMessage);
        Alert.alert('Error', errorMessage);
        return false;
      }
    } catch (error) {
      console.error('=== DELETE USER ERROR ===');
      console.error('Error deleting user:', error);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      
      Alert.alert('Error', `Failed to delete user: ${error.message}`);
      return false;
    }
  };

  const refreshUsers = async () => {
    await fetchUsers();
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  return {
    users,
    isLoading,
    refreshUsers,
    updateUserPermissions,
    deleteUser,
  };
};
