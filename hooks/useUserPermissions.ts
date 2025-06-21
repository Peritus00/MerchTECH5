
import { useState, useEffect } from 'react';
import { Alert } from 'react-native';

interface UserPermissions {
  id: number;
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
}

interface UseUserPermissionsResult {
  users: UserPermissions[];
  isLoading: boolean;
  refreshUsers: () => Promise<void>;
  updateUserPermissions: (userId: number, permissions: Partial<UserPermissions>) => Promise<boolean>;
  deleteUser: (userId: number) => Promise<boolean>;
}

export const useUserPermissions = (): UseUserPermissionsResult => {
  const [users, setUsers] = useState<UserPermissions[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      
      // Mock data for development - replace with actual API call
      const mockUsers: UserPermissions[] = [
        {
          id: 1,
          username: 'djjetfuel',
          email: 'djjetfuel@merchtech.com',
          subscriptionTier: 'premium',
          isAdmin: true,
          canViewAnalytics: true,
          canManagePlaylists: true,
          canEditPlaylists: true,
          canUploadMedia: true,
          canGenerateCodes: true,
          canAccessStore: true,
          canViewFanmail: true,
          canManageQRCodes: true,
          maxPlaylists: 999,
          maxVideos: 999,
          maxAudioFiles: 999,
          maxActivationCodes: 999,
          maxProducts: 999,
          maxQrCodes: 999,
          maxSlideshows: 999,
          isSuspended: false,
          createdAt: '2024-01-01',
          lastActive: '2024-01-20'
        },
        {
          id: 2,
          username: 'testuser',
          email: 'test@example.com',
          subscriptionTier: 'free',
          isAdmin: false,
          canViewAnalytics: false,
          canManagePlaylists: true,
          canEditPlaylists: false,
          canUploadMedia: true,
          canGenerateCodes: false,
          canAccessStore: true,
          canViewFanmail: false,
          canManageQRCodes: true,
          maxPlaylists: 5,
          maxVideos: 10,
          maxAudioFiles: 10,
          maxActivationCodes: 10,
          maxProducts: 5,
          maxQrCodes: 10,
          maxSlideshows: 3,
          isSuspended: false,
          createdAt: '2024-01-15',
          lastActive: '2024-01-19'
        },
        {
          id: 3,
          username: 'premiumuser',
          email: 'premium@example.com',
          subscriptionTier: 'premium',
          isAdmin: false,
          canViewAnalytics: true,
          canManagePlaylists: true,
          canEditPlaylists: true,
          canUploadMedia: true,
          canGenerateCodes: true,
          canAccessStore: true,
          canViewFanmail: true,
          canManageQRCodes: true,
          maxPlaylists: 100,
          maxVideos: 500,
          maxAudioFiles: 500,
          maxActivationCodes: 100,
          maxProducts: 50,
          maxQrCodes: 200,
          maxSlideshows: 50,
          isSuspended: false,
          createdAt: '2024-01-10',
          lastActive: '2024-01-20'
        }
      ];
      
      setUsers(mockUsers);
      
      // Uncomment for real API integration:
      // const response = await fetch('http://0.0.0.0:5000/api/admin/users');
      // if (response.ok) {
      //   const data = await response.json();
      //   setUsers(data);
      // } else {
      //   throw new Error('Failed to fetch users');
      // }
    } catch (error) {
      console.error('Error fetching users:', error);
      Alert.alert('Error', 'Failed to load users');
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

  const deleteUser = async (userId: number): Promise<boolean> => {
    try {
      // Mock delete for development
      setUsers(prev => prev.filter(u => u.id !== userId));
      Alert.alert('Success', 'User deleted successfully');
      return true;
      
      // Uncomment for real API integration:
      // const response = await fetch(`http://0.0.0.0:5000/api/admin/users/${userId}`, {
      //   method: 'DELETE',
      // });
      // 
      // if (response.ok) {
      //   setUsers(prev => prev.filter(u => u.id !== userId));
      //   Alert.alert('Success', 'User deleted successfully');
      //   return true;
      // } else {
      //   const error = await response.json();
      //   Alert.alert('Error', error.message || 'Failed to delete user');
      //   return false;
      // }
    } catch (error) {
      console.error('Error deleting user:', error);
      Alert.alert('Error', 'Failed to delete user');
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
