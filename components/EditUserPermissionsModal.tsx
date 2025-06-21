
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Switch,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

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

interface EditUserPermissionsModalProps {
  visible: boolean;
  user: UserPermissions | null;
  onClose: () => void;
  onUpdatePermissions: (userId: number, permissions: Partial<UserPermissions>) => void;
}

const EditUserPermissionsModal: React.FC<EditUserPermissionsModalProps> = ({
  visible,
  user,
  onClose,
  onUpdatePermissions,
}) => {
  const [permissions, setPermissions] = useState<Partial<UserPermissions>>({});

  useEffect(() => {
    if (user) {
      setPermissions({ ...user });
    }
  }, [user]);

  const handleSave = () => {
    if (!user) return;
    onUpdatePermissions(user.id, permissions);
    onClose();
  };

  const handleClose = () => {
    setPermissions({});
    onClose();
  };

  const updatePermission = (key: keyof UserPermissions, value: any) => {
    setPermissions(prev => ({ ...prev, [key]: value }));
  };

  const permissionCategories = [
    {
      title: 'Basic Permissions',
      permissions: [
        { key: 'canViewAnalytics', label: 'View Analytics', description: 'Access to analytics and reports' },
        { key: 'canManagePlaylists', label: 'Manage Playlists', description: 'Create and manage playlists' },
        { key: 'canEditPlaylists', label: 'Edit Playlists', description: 'Modify existing playlists' },
        { key: 'canUploadMedia', label: 'Upload Media', description: 'Upload audio, video, and images' },
      ],
    },
    {
      title: 'Advanced Permissions',
      permissions: [
        { key: 'canGenerateCodes', label: 'Generate Codes', description: 'Create activation codes' },
        { key: 'canAccessStore', label: 'Access Store', description: 'View and manage store products' },
        { key: 'canViewFanmail', label: 'View Fanmail', description: 'Access fanmail and engagement data' },
        { key: 'canManageQRCodes', label: 'Manage QR Codes', description: 'Create and track QR codes' },
      ],
    },
    {
      title: 'Administrative',
      permissions: [
        { key: 'isAdmin', label: 'Admin Access', description: 'Full system administrator privileges' },
      ],
    },
  ];

  const limitCategories = [
    {
      title: 'Content Limits',
      limits: [
        { key: 'maxPlaylists', label: 'Max Playlists' },
        { key: 'maxVideos', label: 'Max Videos' },
        { key: 'maxAudioFiles', label: 'Max Audio Files' },
        { key: 'maxSlideshows', label: 'Max Slideshows' },
      ],
    },
    {
      title: 'Feature Limits',
      limits: [
        { key: 'maxQrCodes', label: 'Max QR Codes' },
        { key: 'maxActivationCodes', label: 'Max Activation Codes' },
        { key: 'maxProducts', label: 'Max Products' },
      ],
    },
  ];

  if (!user) return null;

  const isProtectedUser = user.username === 'djjetfuel';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose}>
            <MaterialIcons name="close" size={24} color="#1f2937" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Permissions</Text>
          <TouchableOpacity onPress={handleSave}>
            <Text style={styles.saveButton}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
          {/* User Info */}
          <View style={styles.userInfoSection}>
            <View style={styles.userHeader}>
              <View style={styles.avatarContainer}>
                {user.isAdmin ? (
                  <MaterialIcons name="admin-panel-settings" size={24} color="#f59e0b" />
                ) : (
                  <MaterialIcons name="person" size={24} color="#6b7280" />
                )}
              </View>
              <View>
                <Text style={styles.userName}>{user.username}</Text>
                <Text style={styles.userEmail}>{user.email}</Text>
              </View>
            </View>
            {isProtectedUser && (
              <View style={styles.protectedBadge}>
                <MaterialIcons name="shield" size={16} color="#f59e0b" />
                <Text style={styles.protectedText}>Protected Master Admin Account</Text>
              </View>
            )}
          </View>

          {/* Subscription Tier */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Subscription Tier</Text>
            <View style={styles.tierSelector}>
              {['free', 'basic', 'premium'].map((tier) => (
                <TouchableOpacity
                  key={tier}
                  style={[
                    styles.tierOption,
                    permissions.subscriptionTier === tier && styles.selectedTierOption,
                  ]}
                  onPress={() => updatePermission('subscriptionTier', tier)}
                  disabled={isProtectedUser}
                >
                  <Text
                    style={[
                      styles.tierOptionText,
                      permissions.subscriptionTier === tier && styles.selectedTierOptionText,
                    ]}
                  >
                    {tier.charAt(0).toUpperCase() + tier.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Permission Categories */}
          {permissionCategories.map((category) => (
            <View key={category.title} style={styles.section}>
              <Text style={styles.sectionTitle}>{category.title}</Text>
              {category.permissions.map((perm) => (
                <View key={perm.key} style={styles.permissionRow}>
                  <View style={styles.permissionInfo}>
                    <Text style={styles.permissionLabel}>{perm.label}</Text>
                    <Text style={styles.permissionDescription}>{perm.description}</Text>
                  </View>
                  <Switch
                    value={permissions[perm.key as keyof UserPermissions] as boolean || false}
                    onValueChange={(value) => updatePermission(perm.key as keyof UserPermissions, value)}
                    disabled={isProtectedUser && (perm.key === 'isAdmin' || perm.key === 'isSuspended')}
                    trackColor={{ false: '#e5e7eb', true: '#bfdbfe' }}
                    thumbColor={permissions[perm.key as keyof UserPermissions] ? '#3b82f6' : '#9ca3af'}
                  />
                </View>
              ))}
            </View>
          ))}

          {/* Usage Limits */}
          {limitCategories.map((category) => (
            <View key={category.title} style={styles.section}>
              <Text style={styles.sectionTitle}>{category.title}</Text>
              <View style={styles.limitsGrid}>
                {category.limits.map((limit) => (
                  <View key={limit.key} style={styles.limitInput}>
                    <Text style={styles.limitLabel}>{limit.label}</Text>
                    <TextInput
                      style={styles.limitTextInput}
                      value={String(permissions[limit.key as keyof UserPermissions] || 0)}
                      onChangeText={(value) => updatePermission(limit.key as keyof UserPermissions, parseInt(value) || 0)}
                      keyboardType="numeric"
                      placeholder="0"
                      editable={!isProtectedUser}
                    />
                  </View>
                ))}
              </View>
            </View>
          ))}

          {/* Account Status */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Account Status</Text>
            <View style={styles.permissionRow}>
              <View style={styles.permissionInfo}>
                <Text style={styles.permissionLabel}>Suspended</Text>
                <Text style={styles.permissionDescription}>
                  Prevent user from accessing the platform
                </Text>
              </View>
              <Switch
                value={permissions.isSuspended || false}
                onValueChange={(value) => updatePermission('isSuspended', value)}
                disabled={isProtectedUser}
                trackColor={{ false: '#e5e7eb', true: '#fecaca' }}
                thumbColor={permissions.isSuspended ? '#ef4444' : '#9ca3af'}
              />
            </View>
          </View>

          {/* Warning Box */}
          <View style={styles.warningBox}>
            <MaterialIcons name="warning" size={16} color="#f59e0b" />
            <Text style={styles.warningText}>
              Changes to user permissions take effect immediately. Use caution when modifying admin privileges.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

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
  saveButton: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3b82f6',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  userInfoSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  userHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  userName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  userEmail: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
  protectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    padding: 8,
    gap: 6,
  },
  protectedText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#f59e0b',
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12,
  },
  tierSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  tierOption: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  selectedTierOption: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  tierOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
  },
  selectedTierOptionText: {
    color: '#3b82f6',
  },
  permissionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  permissionInfo: {
    flex: 1,
    marginRight: 16,
  },
  permissionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 2,
  },
  permissionDescription: {
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 16,
  },
  limitsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  limitInput: {
    width: '48%',
  },
  limitLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1f2937',
    marginBottom: 6,
  },
  limitTextInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: '#fff',
    color: '#1f2937',
  },
  warningBox: {
    flexDirection: 'row',
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    padding: 12,
    gap: 8,
    marginTop: 8,
  },
  warningText: {
    flex: 1,
    fontSize: 14,
    color: '#92400e',
    lineHeight: 20,
  },
});

export default EditUserPermissionsModal;
