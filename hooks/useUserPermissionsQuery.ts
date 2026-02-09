import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { api } from '@/services/api';
import { User } from '@/types';
import axios from 'axios';

// Query key factory
const userKeys = {
  all: ['users'] as const,
  lists: () => [...userKeys.all, 'list'] as const,
  list: (filters: string) => [...userKeys.lists(), { filters }] as const,
  details: () => [...userKeys.all, 'detail'] as const,
  detail: (id: number) => [...userKeys.details(), id] as const,
};

// Fetch function with complete transformation logic
const fetchUsers = async (): Promise<User[]> => {
  console.log('🔍 Fetching users with React Query');
  const response = await api.get('/admin/all-users');
  const data = response.data;

  console.log('Raw user data received:', data);
  console.log('Number of users:', Array.isArray(data) ? data.length : 'Not an array');

  // Transform the API data to match our User interface
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
      canViewLogs: user.canViewLogs || user.can_view_logs || false,
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
      isPending: isPending,
      firstName: user.firstName || user.first_name,
      lastName: user.lastName || user.last_name,
      isEmailVerified: user.isEmailVerified || user.is_email_verified,
      googleId: user.googleId || user.google_id,
      appleId: user.appleId || user.apple_id,
    };
  });

  console.log('Transformed users:', transformedUsers);
  return transformedUsers;
};

interface UseUserPermissionsResult {
  users: User[];
  isLoading: boolean;
  refreshUsers: () => Promise<void>;
  updateUserPermissions: (userId: number, permissions: Partial<User>) => Promise<boolean>;
  deleteUser: (userId: number | string) => Promise<boolean>;
}

export const useUserPermissionsQuery = (): UseUserPermissionsResult => {
  const queryClient = useQueryClient();

  // Fetch users with automatic refetching
  const { data: users = [], isLoading, refetch } = useQuery({
    queryKey: userKeys.lists(),
    queryFn: fetchUsers,
    staleTime: 0, // Always consider data stale
    gcTime: 5 * 60 * 1000, // Keep unused data in cache for 5 minutes
    refetchOnWindowFocus: true, // Refetch when window regains focus
    refetchOnMount: true, // Refetch on component mount
    retry: 2, // Retry failed requests twice
  });

  // Update user permissions mutation
  const updatePermissionsMutation = useMutation({
    mutationFn: async ({ userId, permissions }: { userId: number; permissions: Partial<User> }) => {
      console.log('🔧 Updating user permissions:', { userId, permissions });
      
      // Map the permissions to the backend field names
      const backendPermissions = {
        subscriptionTier: permissions.subscriptionTier,
        isAdmin: permissions.isAdmin,
        isSuspended: permissions.isSuspended,
        canViewLogs: permissions.canViewLogs,
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
      return response.data;
    },
    onSuccess: () => {
      // Invalidate and refetch users list
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
    onError: (error) => {
      console.error('Error updating permissions:', error);
      Alert.alert('Error', 'Failed to update permissions');
    },
  });

  // Delete user mutation with optimistic updates
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: number | string) => {
      const response = await api.delete(`/admin/users/${userId}`);
      return response.data;
    },
    // Optimistic update
    onMutate: async (userId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: userKeys.lists() });

      // Snapshot previous value
      const previousUsers = queryClient.getQueryData<User[]>(userKeys.lists());

      // Optimistically update cache
      queryClient.setQueryData(userKeys.lists(), (old: User[] = []) => {
        console.log(`🔄 Optimistically removing user ${userId} from React Query cache`);
        return old.filter((user) => user.id !== Number(userId));
      });

      // Return context for rollback
      return { previousUsers };
    },
    onSuccess: () => {
      console.log('✅ User deleted successfully on backend');
      Alert.alert('Success', 'User deleted successfully');
      // Invalidate to refetch fresh data from server
      queryClient.invalidateQueries({ queryKey: userKeys.lists() });
    },
    onError: (error, userId, context) => {
      // Rollback on error
      console.error(`❌ Delete failed, rolling back optimistic update`);
      if (context?.previousUsers) {
        queryClient.setQueryData(userKeys.lists(), context.previousUsers);
      }

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
    },
  });

  return {
    users,
    isLoading,
    refreshUsers: async () => {
      await refetch();
    },
    updateUserPermissions: async (userId: number, permissions: Partial<User>) => {
      try {
        await updatePermissionsMutation.mutateAsync({ userId, permissions });
        return true;
      } catch {
        return false;
      }
    },
    deleteUser: async (userId: number | string) => {
      try {
        await deleteUserMutation.mutateAsync(userId);
        return true;
      } catch {
        return false;
      }
    },
  };
};
