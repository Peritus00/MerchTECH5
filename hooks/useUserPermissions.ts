import { useState, useEffect } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '@/services/api';
import { User } from '@/types';

interface UseUserPermissionsResult {
  users: User[];
  isLoading: boolean;
  refreshUsers: () => Promise<void>;
  updateUserPermissions: (userId: number, permissions: Partial<User>) => Promise<boolean>;
  deleteUser: (userId: number | string) => Promise<boolean>;
}

export const useUserPermissions = (): UseUserPermissionsResult => {
  const [users, setUsers] = useState<User[]>([]);
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
        return `${window.location.protocol}//${hostname}:5001/api`;
      }
      return `${window.location.protocol}//${hostname}:5001/api`;
    }

    return 'http://localhost:5001/api';
  };

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      let token = await AsyncStorage.getItem('authToken');
      console.log('Fetching users with token:', token ? 'Present' : 'Missing');

      // Check if we need to use the developer fallback token
      if (!token) {
        console.log('No token found, checking for developer fallback');
        const currentUser = await AsyncStorage.getItem('currentUser');
        if (currentUser) {
          const user = JSON.parse(currentUser);
          if (user.email === 'djjetfuel@gmail.com') {
            token = 'dev_jwt_token_djjetfuel_12345';
            console.log('Using developer fallback token');
          }
        }
      }

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

      // Handle authentication errors
      if (response.status === 401) {
        console.log('Authentication failed - clearing tokens and redirecting');
        await AsyncStorage.multiRemove(['authToken', 'refreshToken', 'currentUser']);
        throw new Error('Authentication expired. Please log in again.');
      }

      if (response.ok) {
        const data = await response.json();
        console.log('Raw user data received:', data);
        console.log('Number of users:', Array.isArray(data) ? data.length : 'Not an array');

        // Transform the API data to match our UserPermissions interface
        const transformedUsers: User[] = data.map((user: any) => {
          // Use the correct field names from the API response
          const subscriptionTier = user.subscriptionTier || user.subscription_tier || 'free';
          const isPending = user.isPending || user.status === 'pending' || false;

          // Get limits - check for admin-set custom limits first, then fall back to subscription tier defaults
          const getLimit = (customField: string, tierLimits: any) => {
            const customValue = user[customField];
            if (customValue !== null && customValue !== undefined) {
              return customValue; // Admin has set a custom limit
            }
            return tierLimits; // Use subscription tier default
          };

          // Define subscription tier defaults
          let tierLimits = {
            maxQrCodes: 1,
            maxSlideshows: 0,
            maxVideos: 0,
            maxAudioFiles: 3,
            maxProducts: 1,
          };

          if (subscriptionTier === 'basic') {
            tierLimits = {
              maxQrCodes: 3,
              maxSlideshows: 3,
              maxVideos: 1,
              maxAudioFiles: 10,
              maxProducts: 3,
            };
          } else if (subscriptionTier === 'premium') {
            tierLimits = {
              maxQrCodes: 10,
              maxSlideshows: 5,
              maxVideos: 3,
              maxAudioFiles: 20,
              maxProducts: 10,
            };
          }

          // Apply admin overrides if they exist
          const limits = {
            maxQrCodes: getLimit('max_qr_codes', tierLimits.maxQrCodes),
            maxSlideshows: getLimit('max_slideshows', tierLimits.maxSlideshows),
            maxVideos: getLimit('max_videos', tierLimits.maxVideos),
            maxAudioFiles: getLimit('max_audio_files', tierLimits.maxAudioFiles),
            maxProducts: getLimit('max_products', tierLimits.maxProducts),
          };

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
            maxPlaylists: subscriptionTier === 'premium' ? 50 : subscriptionTier === 'basic' ? 25 : 10,
            maxVideos: limits.maxVideos,
            maxAudioFiles: limits.maxAudioFiles,
            maxActivationCodes: subscriptionTier === 'premium' ? 50 : subscriptionTier === 'basic' ? 25 : 10,
            maxProducts: limits.maxProducts,
            maxQrCodes: limits.maxQrCodes,
            maxSlideshows: limits.maxSlideshows,
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
      let errorMessage = 'An unknown error occurred';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      console.error('Error details:', {
        message: errorMessage,
        apiUrl: `${getApiUrl()}/admin/all-users`
      });

      // Don't show alert for network errors, just log them
      if (errorMessage.includes('Network Error') || errorMessage.includes('fetch') || errorMessage.includes('TypeError')) {
        console.log('Network connectivity issue - users list will be empty');
      } else {
        Alert.alert('Error', `Failed to load users: ${errorMessage}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const updateUserPermissions = async (
    userId: number,
    permissions: Partial<User>
  ): Promise<boolean> => {
    try {
      let token = await AsyncStorage.getItem('authToken');
      
      // Check if we need to use the developer fallback token
      if (!token) {
        const currentUser = await AsyncStorage.getItem('currentUser');
        if (currentUser) {
          const user = JSON.parse(currentUser);
          if (user.email === 'djjetfuel@gmail.com') {
            token = 'dev_jwt_token_djjetfuel_12345';
          }
        }
      }

      if (!token) {
        throw new Error('Authentication token not found');
      }

      const apiUrl = `${getApiUrl()}/admin/users/${userId}`;
      
      // Map the permissions to the backend field names
      const backendPermissions = {
        subscriptionTier: permissions.subscriptionTier,
        isAdmin: permissions.isAdmin,
        isSuspended: permissions.isSuspended,
        maxProducts: permissions.maxProducts,
        maxAudioFiles: permissions.maxAudioFiles,
        maxPlaylists: permissions.maxPlaylists,
        maxQrCodes: permissions.maxQrCodes,
        maxSlideshows: permissions.maxSlideshows,
        maxVideos: permissions.maxVideos,
        maxActivationCodes: permissions.maxActivationCodes,
      };

      console.log('Updating user permissions:', { userId, permissions: backendPermissions });

      const response = await fetch(apiUrl, {
        method: 'PATCH',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify(backendPermissions),
      });

      if (response.ok) {
        const result = await response.json();
        console.log('User permissions updated successfully:', result);
        
        // Refresh the users list to get the updated data
        await fetchUsers();
        
        return true;
      } else {
        const error = await response.json();
        console.error('API Error:', error);
        Alert.alert('Error', error.error || 'Failed to update permissions');
        return false;
      }
    } catch (error) {
      console.error('Error updating permissions:', error);
      Alert.alert('Error', 'Failed to update permissions');
      return false;
    }
  };

  const deleteUser = async (userId: number | string): Promise<boolean> => {
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (!token) {
        throw new Error('Authentication token not found');
      }

      const apiUrl = `${getApiUrl()}/admin/users/${userId}`;
      const response = await fetch(apiUrl, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        setUsers(prev => prev.filter(u => u.id !== userId));
        Alert.alert('Success', 'User deleted successfully');
        return true;
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete user');
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error('Error deleting user:', error.message);
        Alert.alert('Error', `Failed to delete user: ${error.message}`);
      } else {
        console.error('An unknown error occurred while deleting user:', error);
        Alert.alert('Error', 'An unknown error occurred while deleting the user.');
      }
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