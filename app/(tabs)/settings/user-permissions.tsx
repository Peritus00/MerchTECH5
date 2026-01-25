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
  Text,
  Platform
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/contexts/AuthContext';
import EditUserPermissionsModal from '@/components/EditUserPermissionsModal';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import ConfirmationModal from '@/components/ConfirmationModal';
import { User } from '@/types';
import { adminQrCodeAPI } from '@/services/api';

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
  onDelete: (user: User) => void;
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
            {user.canViewLogs && <ThemedText style={styles.permissionItem}>• View Activity Logs</ThemedText>}
          </View>
        </View>

        <View style={styles.userLimits}>
          <Text style={styles.limitsTitle}>Current Limits:</Text>
          <View style={styles.limitsGrid}>
            <Text style={styles.limitItem}>
              QR Codes: {user.maxQrCodes}
              {user.maxQrCodes !== undefined && user.maxQrCodes !== null && <Text style={styles.customLimitIndicator}> (Custom)</Text>}
            </Text>
            <Text style={styles.limitItem}>
              Playlists: {user.maxPlaylists}
              {user.maxPlaylists !== undefined && user.maxPlaylists !== null && <Text style={styles.customLimitIndicator}> (Custom)</Text>}
            </Text>
            <Text style={styles.limitItem}>
              Products: {user.maxProducts}
              {user.maxProducts !== undefined && user.maxProducts !== null && <Text style={styles.customLimitIndicator}> (Custom)</Text>}
            </Text>
            <Text style={styles.limitItem}>
              Slideshows: {user.maxSlideshows}
              {user.maxSlideshows !== undefined && user.maxSlideshows !== null && <Text style={styles.customLimitIndicator}> (Custom)</Text>}
            </Text>
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
              onPress={() => onDelete(user)}
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
  const insets = useSafeAreaInsets();
  const { users, isLoading, refreshUsers, updateUserPermissions, deleteUser } = useUserPermissions();
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [assignedQrCodes, setAssignedQrCodes] = useState<any[]>([]);
  const [allQrCodes, setAllQrCodes] = useState<any[]>([]);
  const [qrCodeLoading, setQrCodeLoading] = useState(false);
  const [deleteRequests, setDeleteRequests] = useState<any[]>([]);
  const [deleteRequestsLoading, setDeleteRequestsLoading] = useState(false);
  const [deleteRequestStatus, setDeleteRequestStatus] = useState<'pending' | 'approved' | 'denied'>('pending');

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

  useEffect(() => {
    if (currentUser?.isAdmin) {
      loadDeleteRequests(deleteRequestStatus);
    }
  }, [currentUser?.isAdmin, deleteRequestStatus]);

  const loadDeleteRequests = async (status: 'pending' | 'approved' | 'denied') => {
    setDeleteRequestsLoading(true);
    try {
      const requests = await adminQrCodeAPI.getDeleteRequests(status);
      setDeleteRequests(requests || []);
    } catch (error) {
      console.error('Failed to load delete requests:', error);
    } finally {
      setDeleteRequestsLoading(false);
    }
  };

  const handleApproveDeleteRequest = async (requestId: number) => {
    try {
      await adminQrCodeAPI.approveDeleteRequest(requestId);
      await loadDeleteRequests(deleteRequestStatus);
      Alert.alert('Approved', 'QR code deleted successfully.');
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to approve delete request');
    }
  };

  const handleDenyDeleteRequest = async (requestId: number) => {
    try {
      await adminQrCodeAPI.denyDeleteRequest(requestId);
      await loadDeleteRequests(deleteRequestStatus);
      Alert.alert('Denied', 'Delete request denied.');
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to deny delete request');
    }
  };

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
        // The alert is now handled in the hook
        await refreshUsers();
      } else {
        // The alert is now handled in the hook
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'An unexpected error occurred during deletion.');
    }
  };

  const handleDeleteUser = (user: User) => {
    if (user.username === 'djjetfuel') {
      Alert.alert('Error', 'Cannot delete the protected master admin account');
      return;
    }
    setUserToDelete(user);
    setDeleteModalVisible(true);
  };

  const confirmDeleteUser = () => {
    if (userToDelete) {
      executeDelete(userToDelete.id);
    }
    setDeleteModalVisible(false);
    setUserToDelete(null);
  };

  const loadQrCodeAccess = async (userId: number) => {
    setQrCodeLoading(true);
    try {
      const [assigned, all] = await Promise.all([
        adminQrCodeAPI.getUserDelegatedQrCodes(userId),
        adminQrCodeAPI.getAll()
      ]);
      setAssignedQrCodes(assigned || []);
      setAllQrCodes(all || []);
    } catch (error) {
      console.error('Failed to load QR code access:', error);
    } finally {
      setQrCodeLoading(false);
    }
  };

  const handleEditUser = async (userToEdit: User) => {
    setSelectedUser(userToEdit);
    setEditModalVisible(true);
    await loadQrCodeAccess(userToEdit.id);
  };

  const handleGrantQrCode = async (qrCodeId: number) => {
    if (!selectedUser) return;
    
    // Find the QR code from allQrCodes to create optimistic entry
    const qrIdString = String(qrCodeId);
    const qrCodeToAdd = allQrCodes.find(qr => String(qr.id) === qrIdString);
    if (!qrCodeToAdd) {
      Alert.alert('Error', 'QR code not found');
      return;
    }

    // Create optimistic entry with expected structure
    const optimisticEntry = {
      ...qrCodeToAdd,
      granted_at: new Date().toISOString(),
      owner_email: qrCodeToAdd.owner_email || qrCodeToAdd.ownerEmail,
      owner_username: qrCodeToAdd.owner_username || qrCodeToAdd.ownerUsername,
    };

    // Save previous state for rollback
    const previousAssigned = [...assignedQrCodes];
    
    // Optimistically add to assigned list immediately
    setAssignedQrCodes((prev) => {
      // Check if already exists to avoid duplicates
      if (prev.some(qr => String(qr.id) === qrIdString)) {
        return prev;
      }
      return [...prev, optimisticEntry];
    });

    try {
      await adminQrCodeAPI.addDelegate(qrCodeId.toString(), selectedUser.id);
      // Refresh to get server data (includes granted_at timestamp)
      await loadQrCodeAccess(selectedUser.id);
    } catch (error: any) {
      // Rollback on error
      setAssignedQrCodes(previousAssigned);
      Alert.alert('Error', error?.message || 'Failed to grant QR code access');
    }
  };

  const confirmRevoke = async () => {
    const message = 'Revoke access now? This takes effect immediately even if you do not save the page.';
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return window.confirm(message);
    }
    return new Promise<boolean>((resolve) => {
      Alert.alert('Confirm Revoke', message, [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Revoke', style: 'destructive', onPress: () => resolve(true) },
      ]);
    });
  };

  const handleRevokeQrCode = async (qrCodeId: number, userId: number, skipConfirmation = false) => {
    // Skip confirmation when called from Save (changes apply on Save)
    if (!skipConfirmation) {
      const confirmed = await confirmRevoke();
      if (!confirmed) {
        return;
      }
    }

    const previousAssigned = [...assignedQrCodes];
    const qrIdString = String(qrCodeId);
    setAssignedQrCodes((prev) => prev.filter((qr) => String(qr.id) !== qrIdString));

    try {
      await adminQrCodeAPI.revokeDelegate(qrCodeId.toString(), userId);
      await loadQrCodeAccess(userId);
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 404) {
        // Delegate already revoked; keep optimistic removal and refresh list
        await loadQrCodeAccess(userId);
        return;
      }
      setAssignedQrCodes(previousAssigned);
      Alert.alert('Error', error?.message || 'Failed to revoke QR code access');
    }
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
      {/* Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.push('/(tabs)/settings')}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialIcons name="arrow-back" size={24} color="#1f2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>User Permissions</Text>
        <View style={styles.placeholder} />
      </View>

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

        <View style={styles.deleteRequestsSection}>
          <View style={styles.deleteRequestsHeader}>
            <ThemedText style={styles.sectionTitle}>QR Delete Requests</ThemedText>
            <View style={styles.statusTabs}>
              {(['pending', 'approved', 'denied'] as const).map((status) => (
                <TouchableOpacity
                  key={status}
                  style={[
                    styles.statusTab,
                    deleteRequestStatus === status && styles.activeStatusTab
                  ]}
                  onPress={() => setDeleteRequestStatus(status)}
                >
                  <ThemedText style={[
                    styles.statusTabText,
                    deleteRequestStatus === status && styles.activeStatusTabText
                  ]}>
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {deleteRequestsLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#8b5cf6" />
            </View>
          ) : (
            <View style={styles.deleteRequestList}>
              {deleteRequests.length === 0 && (
                <ThemedText style={styles.helperText}>No delete requests.</ThemedText>
              )}
              {deleteRequests.map((request) => (
                <View key={request.id} style={styles.deleteRequestRow}>
                  <View style={styles.deleteRequestInfo}>
                    <ThemedText style={styles.deleteRequestTitle}>{request.qr_name}</ThemedText>
                    <ThemedText style={styles.deleteRequestSub}>
                      Requested by {request.requested_by_username || request.requested_by_email || 'Unknown'}
                    </ThemedText>
                  </View>
                  {deleteRequestStatus === 'pending' && (
                    <View style={styles.deleteRequestActions}>
                      <TouchableOpacity
                        style={styles.approveButton}
                        onPress={() => handleApproveDeleteRequest(request.id)}
                      >
                        <ThemedText style={styles.approveButtonText}>Approve</ThemedText>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.denyButton}
                        onPress={() => handleDenyDeleteRequest(request.id)}
                      >
                        <ThemedText style={styles.denyButtonText}>Deny</ThemedText>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}
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
              onDelete={handleDeleteUser}
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
          assignedQrCodes={assignedQrCodes}
          allQrCodes={allQrCodes}
          qrCodeLoading={qrCodeLoading}
          onGrantQrCode={handleGrantQrCode}
          onRevokeQrCode={handleRevokeQrCode}
        />
      )}

      {userToDelete && (
        <ConfirmationModal
          visible={deleteModalVisible}
          title="Delete User"
          message={`Are you sure you want to permanently delete ${userToDelete.username}? This action cannot be undone.`}
          onConfirm={confirmDeleteUser}
          onClose={() => setDeleteModalVisible(false)}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  placeholder: {
    width: 32,
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
  deleteRequestsSection: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  deleteRequestsHeader: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 8,
  },
  statusTabs: {
    flexDirection: 'row',
    gap: 8,
  },
  statusTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#e5e7eb',
  },
  activeStatusTab: {
    backgroundColor: '#3b82f6',
  },
  statusTabText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '600',
  },
  activeStatusTabText: {
    color: '#ffffff',
  },
  deleteRequestList: {
    gap: 10,
  },
  deleteRequestRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
  },
  deleteRequestInfo: {
    flex: 1,
    marginRight: 12,
  },
  deleteRequestTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  deleteRequestSub: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  deleteRequestActions: {
    flexDirection: 'row',
    gap: 8,
  },
  approveButton: {
    backgroundColor: '#10b981',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  approveButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  denyButton: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  denyButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  helperText: {
    fontSize: 12,
    color: '#6b7280',
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
  customLimitIndicator: {
    fontSize: 11,
    color: '#f59e0b',
    fontWeight: '600',
    fontStyle: 'italic',
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