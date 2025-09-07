import { useState, useEffect } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '@/services/api';
import { User } from '@/types';
import axios from 'axios';

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

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      console.log('🔍 Fetching users with centralized API service');
      
      const response = await api.get('/admin/all-users');
      const data = response.data;
      
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
    } catch (error) {
      console.error('Error fetching users:', error);
      let errorMessage = 'An unknown error occurred';
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      console.error('Error details:', {
        message: errorMessage
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
      console.log('🔧 Updating user permissions:', { userId, permissions });
      
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

      const response = await api.patch(`/admin/users/${userId}`, backendPermissions);
      
      console.log('User permissions updated successfully:', response.data);
      
      // Refresh the users list to get the updated data
      await fetchUsers();
      
      return true;
    } catch (error) {
      console.error('Error updating permissions:', error);
      Alert.alert('Error', 'Failed to update permissions');
      return false;
    }
  };

  const deleteUser = async (userId: number | string): Promise<boolean> => {
    try {
      const response = await api.delete(`/admin/users/${userId}`);
      
      if (response.status === 200) {
        setUsers(prev => prev.filter(u => u.id !== Number(userId)));
        Alert.alert('Success', 'User deleted successfully');
        return true;
      } else {
        const errorData = response.data || { error: 'Failed to delete user' };
        throw new Error(errorData.error);
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const errorMessage = error.response?.data?.error || error.message;
        console.error('Error deleting user:', errorMessage);
        Alert.alert('Error', `Failed to delete user: ${errorMessage}`);
      } else if (error instanceof Error) {
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