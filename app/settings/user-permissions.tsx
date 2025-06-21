import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Text
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/contexts/AuthContext';
import EditUserPermissionsModal from '@/components/EditUserPermissionsModal';
import { useUserPermissions } from '@/hooks/useUserPermissions';

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

const UserStatsCard = ({ title, value, icon, color }: { title: string; value: number; icon: string; color: string }) => (
  <View style={[styles.statsCard, { borderLeftColor: color }]}>
    <View style={styles.statsHeader}>
      <MaterialIcons name={icon as any} size={24} color={color} />
      <ThemedText style={styles.statsValue}>{value}</ThemedText>
    </View>
    <ThemedText style={styles.statsTitle}>{title}</ThemedText>
  </View>
);

const UserPermissionCard = ({ 
  user, 
  onEdit, 
  onSuspend, 
  onDelete 
}: { 
  user: UserPermissions; 
  onEdit: () => void; 
  onSuspend: (suspend: boolean) => void; 
  onDelete: () => void; 
}) => {
  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'premium': return '#8b5cf6';
      case 'basic': return '#3b82f6';
      default: return '#6b7280';
    }
  };

  const getTierLabel = (tier: string) => {
    switch (tier) {
      case 'premium': return 'Premium';
      case 'basic': return 'Basic';
      default: return 'Free';
    }
  };

  return (
    <View style={[styles.userCard, user.isSuspended && styles.suspendedCard]}>
      <View style={styles.userInfo}>
        <View style={styles.userHeader}>
          <View style={styles.userDetails}>
            <ThemedText style={styles.username}>{user.username}</ThemedText>
            <ThemedText style={styles.userEmail}>{user.email}</ThemedText>
          </View>
          <View style={styles.userBadges}>
            <View style={[styles.tierBadge, { backgroundColor: getTierColor(user.subscriptionTier) }]}>
              <ThemedText style={styles.tierText}>{getTierLabel(user.subscriptionTier)}</ThemedText>
            </View>
            {user.isAdmin && (
              <View style={styles.adminBadge}>
                <ThemedText style={styles.adminText}>Admin</ThemedText>
              </View>
            )}
             {user.isPending && (
              <View style={[styles.suspendedBadge, { backgroundColor: '#f59e0b' }]}>
                <ThemedText style={styles.suspendedText}>PENDING</ThemedText>
              </View>
            )}
            {user.isSuspended && (
              <View style={styles.suspendedBadge}>
                <ThemedText style={styles.suspendedText}>Suspended</ThemedText>
              </View>
            )}
          </View>
        </View>

        <View style={styles.permissionsSummary}>
          <ThemedText style={styles.permissionsTitle}>Active Permissions:</ThemedText>
          <View style={styles.permissionsList}>
            {user.canManagePlaylists && <ThemedText style={styles.permissionItem}>• Manage Playlists</ThemedText>}
            {user.canUploadMedia && <ThemedText style={styles.permissionItem}>• Upload Media</ThemedText>}
            {user.canGenerateCodes && <ThemedText style={styles.permissionItem}>• Generate Codes</ThemedText>}
            {user.canViewAnalytics && <ThemedText style={styles.permissionItem}>• View Analytics</ThemedText>}
            {user.canAccessStore && <ThemedText style={styles.permissionItem}>• Access Store</ThemedText>}
          </View>
        </View>

        <View style={styles.userLimits}>
          <Text style={styles.limitsTitle}>Current Limits:</Text>
          <View style={styles.limitsGrid}>
            <Text style={styles.limitItem}>QR Codes: {user.maxQrCodes}</Text>
            <Text style={styles.limitItem}>Playlists: {user.maxPlaylists}</Text>
            <Text style={styles.limitItem}>Products: {user.maxProducts}</Text>
            <Text style={styles.limitItem}>Slideshows: {user.maxSlideshows}</Text>
          </View>
        </View>
      </View>

      <View style={styles.userActions}>
        <TouchableOpacity style={styles.editButton} onPress={onEdit}>
          <MaterialIcons name="edit" size={18} color="#3b82f6" />
          <Text style={styles.editButtonText}>Edit</Text>
        </TouchableOpacity>

        {user.username !== 'djjetfuel' && (
          <>
            <TouchableOpacity 
              style={[styles.suspendButton, user.isSuspended && styles.unsuspendButton]} 
              onPress={() => onSuspend(!user.isSuspended)}
            >
              <MaterialIcons 
                name={user.isSuspended ? "play-arrow" : "pause"} 
                size={18} 
                color={user.isSuspended ? "#10b981" : "#f59e0b"} 
              />
              <Text style={styles.suspendButtonText}>
                {user.isSuspended ? 'Unsuspend' : 'Suspend'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.deleteButton} 
              onPress={() => {
                console.log('Delete button pressed for user:', user.username);
                onDelete();
              }}
              activeOpacity={0.7}
            >
              <MaterialIcons name="delete" size={18} color="#ef4444" />
              <Text style={styles.deleteButtonText}>Delete</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
};

type FilterType = 'all' | 'active' | 'admins' | 'pending' | 'suspended';

export default function UserPermissionsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { users, isLoading, refreshUsers, updateUserPermissions, deleteUser } = useUserPermissions();
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserPermissions | null>(null);

  // Check if current user is admin
  React.useEffect(() => {
    // Only check permissions after user data is loaded
    if (user === null) {
      // Still loading user data
      return;
    }

    if (!user?.isAdmin && user?.username !== 'djjetfuel') {
      Alert.alert('Access Denied', 'You do not have permission to access this page', [
        { text: 'OK', onPress: () => router.back() }
      ]);
      return;
    }
  }, [user, router]);

  const handleSuspendUser = async (userId: number | string, suspend: boolean) => {
    const targetUser = users.find(u => u.id === userId);
    if (!targetUser) return;

    // Don't allow suspending pending users
    if (typeof userId === 'string' && userId.startsWith('pending_')) {
      Alert.alert('Error', 'Cannot suspend pending users. Please approve or delete them instead.');
      return;
    }

    Alert.alert(
      suspend ? 'Suspend User' : 'Unsuspend User',
      `Are you sure you want to ${suspend ? 'suspend' : 'unsuspend'} ${targetUser.username}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: suspend ? 'Suspend' : 'Unsuspend',
          style: suspend ? 'destructive' : 'default',
          onPress: async () => {
            if (typeof userId === 'number') {
              await updateUserPermissions(userId, { isSuspended: suspend });
            }
          },
        },
      ]
    );
  };

  const handleDeleteUser = async (userId: number | string) => {
    console.log('Delete button clicked for user ID:', userId);

    const targetUser = users.find(u => u.id === userId);
    if (!targetUser) {
      console.log('User not found for deletion:', userId);
      Alert.alert('Error', 'User not found');
      return;
    }

    console.log('Target user found:', targetUser);

    if (targetUser.username === 'djjetfuel') {
      Alert.alert('Error', 'Cannot delete the protected master admin account');
      return;
    }

    const isPending = typeof userId === 'string' && userId.startsWith('pending_');
    const actionText = isPending ? 'remove this pending registration' : 'permanently delete this user';

    console.log('Showing delete confirmation dialog');

    Alert.alert(
      isPending ? 'Remove Pending User' : 'Delete User',
      `Are you sure you want to ${actionText} (${targetUser.username})? This action cannot be undone.`,
      [
        { 
          text: 'Cancel', 
          style: 'cancel',
          onPress: () => console.log('Delete cancelled')
        },
        {
          text: isPending ? 'Remove' : 'Delete',
          style: 'destructive',
          onPress: async () => {
            console.log('Delete confirmed - attempting to delete user with ID:', userId);
            console.log('Target user:', targetUser);

            try {
              const success = await deleteUser(userId);
              console.log('Delete operation result:', success);

              if (success) {
                console.log('User deleted successfully');
                Alert.alert('Success', 'User deleted successfully');
                // Refresh the user list
                await refreshUsers();
              } else {
                console.log('Delete operation failed');
                Alert.alert('Error', 'Failed to delete user. Please try again.');
              }
            } catch (error) {
              console.error('Error in delete handler:', error);
              Alert.alert('Error', `An unexpected error occurred: ${error.message}`);
            }
          },
        },
      ]
    );
  };

  const handleEditUser = (userId: number | string) => {
    const targetUser = users.find(u => u.id === userId);
    if (targetUser) {
      setSelectedUser(targetUser);
      setEditModalVisible(true);
    }
  };

  const handleUpdatePermissions = async (userId: number, permissions: Partial<UserPermissions>) => {
    await updateUserPermissions(userId, permissions);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshUsers();
    setRefreshing(false);
  };

  const getFilteredUsers = () => {
    let filtered = users;

    if (searchQuery) {
      filtered = filtered.filter(user =>
        user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    switch (filterType) {
      case 'admins':
        filtered = filtered.filter(user => user.isAdmin);
        break;
      case 'suspended':
        filtered = filtered.filter(user => user.isSuspended);
        break;
      case 'active':
        filtered = filtered.filter(user => !user.isSuspended);
        break;
      case 'pending':
          filtered = filtered.filter(user => user.isPending);
          break;
    }

    return filtered;
  };

  const filteredUsers = getFilteredUsers();

  const getUserStats = () => {
    const totalUsers = users.length;
    const adminUsers = users.filter(u => u.isAdmin).length;
    const suspendedUsers = users.filter(u => u.isSuspended).length;
    const premiumUsers = users.filter(u => u.subscriptionTier === 'premium').length;
    return { totalUsers, adminUsers, suspendedUsers, premiumUsers };
  };

  const stats = getUserStats();

  // Show loading state while user data is being fetched
  if (user === null) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <ThemedText style={styles.loadingText}>Loading...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  // Check permissions - allow djjetfuel user or admin users
  if (!user?.isAdmin && user?.username !== 'djjetfuel') {
    return null;
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color="#1f2937" />
        </TouchableOpacity>
        <ThemedText type="title" style={styles.headerTitle}>User Permissions</ThemedText>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Stats Overview */}
        <View style={styles.statsContainer}>
          <UserStatsCard
            title="Total Users"
            value={stats.totalUsers}
            icon="people"
            color="#3b82f6"
          />
          <UserStatsCard
            title="Admins"
            value={stats.adminUsers}
            icon="admin-panel-settings"
            color="#f59e0b"
          />
          <UserStatsCard
            title="Suspended"
            value={stats.suspendedUsers}
            icon="block"
            color="#ef4444"
          />
          <UserStatsCard
            title="Premium"
            value={stats.premiumUsers}
            icon="star"
            color="#8b5cf6"
          />
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <MaterialIcons name="search" size={20} color="#6b7280" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search users by name or email..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#9ca3af"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <MaterialIcons name="clear" size={20} color="#6b7280" />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter Tabs */}

        <View style={styles.filterTabs}>
          {[
            { key: 'all', label: 'All Users' },
            { key: 'admins', label: 'Admins' },
            { key: 'active', label: 'Active' },
            { key: 'pending', label: 'Pending'},
            { key: 'suspended', label: 'Suspended' },
          ].map((filter) => (
            <TouchableOpacity
              key={filter.key}
              style={[
                styles.filterTab,
                filterType === filter.key && styles.activeFilterTab,
              ]}
              onPress={() => setFilterType(filter.key as any)}
            >
              <ThemedText
                style={[
                  styles.filterTabText,
                  filterType === filter.key && styles.activeFilterTabText,
                ]}
              >
                {filter.label}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>

        {/* Users List */}
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3b82f6" />
            <ThemedText style={styles.loadingText}>Loading users...</ThemedText>
          </View>
        ) : filteredUsers.length > 0 ? (
          <View style={styles.usersList}>
            {filteredUsers.map((userItem) => (
              <UserPermissionCard
                key={userItem.id}
                user={userItem}
                onEdit={() => handleEditUser(userItem.id)}
                onSuspend={(suspend) => handleSuspendUser(userItem.id, suspend)}
                onDelete={() => handleDeleteUser(userItem.id)}
              />
            ))}
          </View>
        ) : (
          <View style={styles.emptyContainer}>
            <MaterialIcons name="people-outline" size={64} color="#9ca3af" />
            <ThemedText style={styles.emptyText}>
              {searchQuery || filterType !== 'all' ? 'No users found' : 'No users yet'}
            </ThemedText>
            <ThemedText style={styles.emptySubtext}>
              {searchQuery || filterType !== 'all'
                ? 'Try adjusting your search or filter criteria'
                : 'Users will appear here once they register'
              }
            </ThemedText>
          </View>
        )}
      </ScrollView>

      <EditUserPermissionsModal
        visible={editModalVisible}
        user={selectedUser}
        onClose={() => {
          setEditModalVisible(false);
          setSelectedUser(null);
        }}
        onUpdatePermissions={handleUpdatePermissions}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  statsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    flex: 1,
    minWidth: '45%',
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  statsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statsValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  statsTitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#1f2937',
  },
  filterTabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  activeFilterTab: {
    backgroundColor: '#3b82f6',
  },
  filterTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  activeFilterTabText: {
    color: '#fff',
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6b7280',
  },
  usersList: {
    gap: 12,
  },
  userCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  suspendedCard: {
    opacity: 0.7,
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  userInfo: {
    marginBottom: 16,
  },
  userHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  userDetails: {
    flex: 1,
  },
  username: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
    color: '#1f2937',
  },
  userEmail: {
    fontSize: 14,
    color: '#6b7280',
  },
  userBadges: {
    gap: 6,
    alignItems: 'flex-end',
  },
  tierBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tierText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  adminBadge: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  adminText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  suspendedBadge: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  suspendedText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  permissionsSummary: {
    marginBottom: 12,
  },
  permissionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
    color: '#1f2937',
  },
  permissionsList: {
    gap: 2,
  },
  permissionItem: {
    fontSize: 12,
    color: '#4b5563',
  },
  userLimits: {
    marginBottom: 12,
  },
  limitsTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
    color: '#1f2937',
  },
  limitsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  limitItem: {
    fontSize: 12,
    color: '#4b5563',
    minWidth: '45%',
  },
  userActions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  editButtonText: {
    color: '#3b82f6',
    fontSize: 14,
    fontWeight: '600',
  },
  suspendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  unsuspendButton: {
    backgroundColor: '#d1fae5',
  },
  suspendButtonText: {
    color: '#f59e0b',
    fontSize: 14,
    fontWeight: '600',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fee2e2',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
    minHeight: 36,
    minWidth: 80,
    justifyContent: 'center',
  },
  deleteButtonText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6b7280',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    paddingHorizontal: 32,
    lineHeight: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  refreshButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#eff6ff',
  },
  retryButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 12,
  },
  retryText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  refreshText: {
    color: '#3b82f6',
    fontWeight: '600',
  },
});