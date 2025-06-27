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
import { User } from '@/types';

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
  user: User;
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
              onPress={onDelete}
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
  const { user: currentUser } = useAuth();
  const router = useRouter();
  const { users, isLoading, refreshUsers, updateUserPermissions, deleteUser } = useUserPermissions();
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  React.useEffect(() => {
    if (currentUser === null) {
      return;
    }

    if (!currentUser?.isAdmin && currentUser?.username !== 'djjetfuel') {
      Alert.alert('Access Denied', 'You do not have permission to access this page', [
        { text: 'OK', onPress: () => router.replace('/') }
      ]);
    }
  }, [currentUser, router]);

  const handleSuspendUser = async (userId: number, suspend: boolean) => {
    const targetUser = users.find(u => u.id === userId);
    if (!targetUser) return;

    Alert.alert(
      suspend ? 'Suspend User' : 'Unsuspend User',
      `Are you sure you want to ${suspend ? 'suspend' : 'unsuspend'} ${targetUser.username}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: suspend ? 'Suspend' : 'Unsuspend',
          onPress: async () => {
            try {
              await updateUserPermissions(userId, { isSuspended: suspend });
              Alert.alert('Success', `User ${suspend ? 'suspended' : 'unsuspended'} successfully`);
              await refreshUsers();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'An unexpected error occurred.');
            }
          },
        },
      ]
    );
  };

  const executeDelete = async (userId: number) => {
    try {
      const success = await deleteUser(userId);
      if (success) {
        Alert.alert('Success', 'User deleted successfully');
        await refreshUsers();
      } else {
        Alert.alert('Error', 'Failed to delete user.');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'An unexpected error occurred during deletion.');
    }
  };

  const handleDeleteUser = async (userId: number) => {
    const targetUser = users.find(u => u.id === userId);
    if (!targetUser) return;

    if (targetUser.username === 'djjetfuel') {
      Alert.alert('Error', 'Cannot delete the protected master admin account');
      return;
    }

    Alert.alert(
      'Delete User',
      `Are you sure you want to permanently delete ${targetUser.username}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => executeDelete(userId),
        },
      ]
    );
  };

  const handleEditUser = (userToEdit: User) => {
    setSelectedUser(userToEdit);
    setEditModalVisible(true);
  };

  const handleUpdatePermissions = async (userId: number, permissions: Partial<User>) => {
    try {
      await updateUserPermissions(userId, permissions);
      Alert.alert('Success', 'User permissions updated successfully.');
      setEditModalVisible(false);
      await refreshUsers();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update user permissions.');
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshUsers();
    setRefreshing(false);
  };

  const getFilteredUsers = () => {
    let filtered = users;
    if (filterType === 'active') {
      filtered = users.filter(u => !u.isSuspended && !u.isPending);
    } else if (filterType === 'admins') {
      filtered = users.filter(u => u.isAdmin);
    } else if (filterType === 'pending') {
      filtered = users.filter(u => u.isPending);
    } else if (filterType === 'suspended') {
      filtered = users.filter(u => u.isSuspended);
    }

    if (!searchQuery) {
      return filtered;
    }

    return filtered.filter(u =>
      u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase())
    );
  };

  const getUserStats = () => {
    const totalUsers = users.length;
    const admins = users.filter(u => u.isAdmin).length;
    const suspended = users.filter(u => u.isSuspended).length;
    const pending = users.filter(u => u.isPending).length;
    return { totalUsers, admins, suspended, pending };
  };

  if (isLoading && !refreshing && !users.length) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8b5cf6" />
        <ThemedText>Loading users...</ThemedText>
      </ThemedView>
    );
  }

  const filteredUsers = getFilteredUsers();
  const stats = getUserStats();

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.statsContainer}>
          <UserStatsCard title="Total Users" value={stats.totalUsers} icon="people" color="#3b82f6" />
          <UserStatsCard title="Admins" value={stats.admins} icon="shield" color="#f59e0b" />
          <UserStatsCard title="Suspended" value={stats.suspended} icon="block" color="#ef4444" />
          <UserStatsCard title="Premium" value={stats.pending} icon="star" color="#8b5cf6" />
        </View>

        <View style={styles.searchContainer}>
          <MaterialIcons name="search" size={20} color="#6b7280" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search users by name or email..."
            placeholderTextColor="#6b7280"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        <View style={styles.filterTabs}>
          {['all', 'admins', 'active', 'suspended'].map((filter) => (
            <TouchableOpacity
              key={filter}
              style={[styles.filterTab, filterType === filter && styles.activeFilterTab]}
              onPress={() => setFilterType(filter as FilterType)}
            >
              <ThemedText style={[styles.filterText, filterType === filter && styles.activeFilterText]}>
                {filter.charAt(0).toUpperCase() + filter.slice(1)}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#8b5cf6" />
          </View>
        ) : (
          filteredUsers.map((userItem) => (
            <UserPermissionCard
              key={userItem.id}
              user={userItem}
              onEdit={() => handleEditUser(userItem)}
              onSuspend={(suspend) => handleSuspendUser(userItem.id, suspend)}
              onDelete={() => handleDeleteUser(userItem.id)}
            />
          ))
        )}
      </ScrollView>

      {selectedUser && (
        <EditUserPermissionsModal
          user={selectedUser}
          visible={editModalVisible}
          onClose={() => setEditModalVisible(false)}
          onUpdatePermissions={handleUpdatePermissions}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 200,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statsCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 4,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  statsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statsValue: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  statsTitle: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 16,
    height: 48,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16,
    color: '#111827',
  },
  filterTabs: {
    flexDirection: 'row',
    marginBottom: 16,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 4,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  activeFilterTab: {
    backgroundColor: '#8b5cf6',
  },
  filterText: {
    fontWeight: '600',
    color: '#4b5563',
  },
  activeFilterText: {
    color: '#ffffff',
  },
  userCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginBottom: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  suspendedCard: {
    backgroundColor: '#fee2e2',
    opacity: 0.8,
  },
  userInfo: {},
  userHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  userDetails: {
    flex: 1,
  },
  username: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
  },
  userEmail: {
    fontSize: 14,
    color: '#6b7280',
  },
  userBadges: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tierBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  tierText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  adminBadge: {
    marginLeft: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: '#d1fae5',
  },
  adminText: {
    color: '#065f46',
    fontSize: 12,
    fontWeight: '600',
  },
  suspendedBadge: {
    marginLeft: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: '#ef4444',
  },
  suspendedText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  permissionsSummary: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 12,
  },
  permissionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  permissionsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginLeft: -4,
  },
  permissionItem: {
    fontSize: 13,
    color: '#4b5563',
    margin: 4,
  },
  userLimits: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 12,
  },
  limitsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  limitsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    margin: -4,
  },
  limitItem: {
    fontSize: 13,
    color: '#4b5563',
    backgroundColor: '#f3f4f6',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    margin: 4,
  },
  userActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#e0e7ff',
  },
  editButtonText: {
    marginLeft: 6,
    color: '#3b82f6',
    fontWeight: '600',
  },
  suspendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#fef3c7',
    marginLeft: 8,
  },
  suspendButtonText: {
    marginLeft: 6,
    color: '#f59e0b',
    fontWeight: '600',
  },
  unsuspendButton: {
    backgroundColor: '#d1fae5',
  },
  unsuspendButtonText: {
    color: '#10b981',
    fontWeight: '600'
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#fee2e2',
    marginLeft: 8,
  },
  deleteButtonText: {
    marginLeft: 6,
    color: '#ef4444',
    fontWeight: '600',
  },
  modalView: {
    margin: 20,
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 35,
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
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  permissionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  permissionToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '48%',
    marginBottom: 10,
  },
  limitsContainer: {
    width: '100%',
    marginTop: 20,
  },
  limitInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  limitLabel: {
    fontSize: 16,
  },
  limitInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    padding: 8,
    width: 80,
    textAlign: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 20,
  },
  saveButton: {
    backgroundColor: '#2196F3',
    borderRadius: 20,
    padding: 10,
    elevation: 2,
    width: '48%',
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f44336',
    borderRadius: 20,
    padding: 10,
    elevation: 2,
    width: '48%',
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  errorText: {
    color: 'red',
    marginTop: 10,
  },
});