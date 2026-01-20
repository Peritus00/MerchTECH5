
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  TextInput,
  Switch,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { AdvancedQRCodeGenerator } from '@/components/AdvancedQRCodeGenerator';
import { qrCodeService } from '@/services/qrCodeService';
import { adminQrCodeAPI, api } from '@/services/api';
import { downloadQRCode, shareQRCode, QRCodeFormat } from '@/services/qrUtils';
import { captureRef } from 'react-native-view-shot';
import { QRCode } from '@/types';
import { useAuth } from '@/contexts/AuthContext';

export default function QRCodeDetailsScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qrRef = useRef<any>(null);
  const qrGeneratorRef = useRef<any>(null);
  
  const { user } = useAuth();
  const [qrCode, setQrCode] = useState<QRCode | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editedQRCode, setEditedQRCode] = useState<QRCode | null>(null);
  const [delegates, setDelegates] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [delegateSearch, setDelegateSearch] = useState('');
  const [selectedDelegateId, setSelectedDelegateId] = useState<number | null>(null);
  const [delegateLoading, setDelegateLoading] = useState(false);

  useEffect(() => {
    console.log('🔍 QR Details: Component loaded with ID:', id);
    console.log('🔍 QR Details: ID type:', typeof id);
    fetchQRCode();
  }, [id]);

  useEffect(() => {
    if (user?.isAdmin && qrCode?.id) {
      loadDelegationData();
    }
  }, [user?.isAdmin, qrCode?.id]);

  const fetchQRCode = async () => {
    try {
      console.log('🔍 QR Details: Fetching QR code with ID:', id);
      const qr = await qrCodeService.getQRCodeById(parseInt(id as string));
      console.log('🔍 QR Details: Fetched QR code:', qr);
      setQrCode(qr);
      setEditedQRCode(qr);
    } catch (error) {
      console.error('🔍 QR Details: Failed to fetch QR code:', error);
      Alert.alert('Error', 'Failed to load QR code');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const loadDelegationData = async () => {
    if (!qrCode?.id) return;
    setDelegateLoading(true);
    try {
      const [delegateList, users] = await Promise.all([
        adminQrCodeAPI.getDelegates(qrCode.id.toString()),
        api.get('/admin/all-users').then(res => res.data || [])
      ]);
      setDelegates(delegateList || []);
      setAllUsers(users || []);
    } catch (error) {
      console.error('Failed to load delegation data:', error);
    } finally {
      setDelegateLoading(false);
    }
  };

  const handleGrantDelegate = async () => {
    if (!qrCode?.id || !selectedDelegateId) return;
    try {
      await adminQrCodeAPI.addDelegate(qrCode.id.toString(), selectedDelegateId);
      setSelectedDelegateId(null);
      setDelegateSearch('');
      await loadDelegationData();
      Alert.alert('Success', 'Delegate access granted');
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to grant delegate access');
    }
  };

  const handleRevokeDelegate = async (userId: number) => {
    if (!qrCode?.id) return;
    try {
      await adminQrCodeAPI.revokeDelegate(qrCode.id.toString(), userId);
      await loadDelegationData();
      Alert.alert('Success', 'Delegate access revoked');
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to revoke delegate access');
    }
  };

  const handleSave = async () => {
    if (!editedQRCode) return;

    try {
      await qrCodeService.updateQRCode(editedQRCode.id, {
        name: editedQRCode.name,
        url: editedQRCode.url,
        description: editedQRCode.description,
        options: editedQRCode.options,
      });
      
      setQrCode(editedQRCode);
      setEditing(false);
      Alert.alert('Success', 'QR code updated successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to update QR code');
    }
  };

  const handleDelete = () => {
    console.log('🗑️ QR Delete: Delete button pressed for QR code:', qrCode?.name, 'ID:', id);
    console.log('🗑️ QR Delete: Current QR code data:', JSON.stringify(qrCode, null, 2));

    const confirmDelete = async () => {
      try {
        console.log('🗑️ QR Delete: User confirmed deletion, starting delete for ID:', id);
        console.log('🗑️ QR Delete: Calling qrCodeService.deleteQRCode with ID:', parseInt(id as string));

        await qrCodeService.deleteQRCode(parseInt(id as string));

        console.log('🗑️ QR Delete: Delete successful, showing success alert');
        Alert.alert('Deleted', 'QR code deleted successfully');
        router.back();
      } catch (error: any) {
        console.error('🗑️ QR Delete: Delete failed:', error);
        console.error('🗑️ QR Delete: Error details:', {
          message: error.message,
          status: error.status,
          response: error.response?.data
        });
        const errorMessage = error.message || 'Failed to delete QR code';
        Alert.alert('Delete Failed', errorMessage);
      }
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const confirmed = window.confirm('Delete QR code? This action cannot be undone.');
      if (confirmed) {
        confirmDelete();
      } else {
        console.log('🗑️ QR Delete: User cancelled deletion');
      }
      return;
    }

    Alert.alert(
      'Delete QR Code',
      'Are you sure you want to delete this QR code? This action cannot be undone.',
      [
        { 
          text: 'Cancel', 
          style: 'cancel',
          onPress: () => {
            console.log('🗑️ QR Delete: User cancelled deletion');
          }
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: confirmDelete,
        },
      ]
    );
  };

  const handleRequestDelete = () => {
    const submitRequest = async () => {
      try {
        await qrCodeService.requestDeleteQRCode(parseInt(id as string));
        await fetchQRCode();
        Alert.alert('Request Submitted', 'Your delete request has been sent to the admin.');
      } catch (error: any) {
        Alert.alert('Error', error.message || 'Failed to submit delete request');
      }
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const confirmed = window.confirm('Submit a delete request to the admin for approval?');
      if (confirmed) {
        submitRequest();
      }
      return;
    }

    Alert.alert(
      'Request Delete',
      'Submit a delete request to the admin for approval?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit Request',
          onPress: submitRequest
        }
      ]
    );
  };

  const handleDownload = async (format: QRCodeFormat) => {
    if (!qrCode || !qrRef.current) return;
    
    try {
      await downloadQRCode(qrRef.current, qrCode.name, format, qrGeneratorRef.current);
    } catch (error) {
      Alert.alert('Error', 'Failed to download QR code');
    }
  };

  const handleShare = async () => {
    if (!qrCode || !qrRef.current) return;
    
    try {
      const uri = await captureRef(qrRef.current, {
        format: 'png',
        quality: 1.0,
        width: 800,
        height: 800,
      });
      
      await shareQRCode(uri, `${qrCode.name}.png`);
    } catch (error) {
      Alert.alert('Error', 'Failed to share QR code');
    }
  };

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Loading...</ThemedText>
      </ThemedView>
    );
  }

  if (!qrCode) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>QR Code not found</ThemedText>
      </ThemedView>
    );
  }

  const currentQRCode = editing ? editedQRCode : qrCode;
  const ownerId = (qrCode as any)?.user_id ?? qrCode?.ownerId;
  const isOwner = ownerId ? ownerId === user?.id : false;
  const isAdmin = !!user?.isAdmin;
  const isDelegate = !!(qrCode as any)?.is_delegate && !isOwner;
  const canEdit = isOwner || isAdmin || isDelegate;
  const filteredUsers = allUsers.filter((u) => {
    if (!delegateSearch.trim()) return true;
    const haystack = `${u.email || ''} ${u.username || ''}`.toLowerCase();
    return haystack.includes(delegateSearch.toLowerCase());
  }).filter((u) => u.id !== ownerId);
  const activeDelegates = delegates.filter((d) => !d.revoked_at);

  return (
    <ScrollView style={styles.container}>
      <ThemedView style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <View style={styles.headerButtons}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <ThemedText style={styles.backButtonText}>← Back</ThemedText>
          </TouchableOpacity>
          
          <View style={styles.headerActions}>
            {canEdit && (
              <TouchableOpacity 
                style={styles.editButton}
                onPress={() => {
                  if (editing) {
                    setEditedQRCode(qrCode);
                  }
                  setEditing(!editing);
                }}
              >
                <ThemedText style={styles.editButtonText}>
                  {editing ? 'Cancel' : 'Edit'}
                </ThemedText>
              </TouchableOpacity>
            )}
            
            {editing && canEdit && (
              <TouchableOpacity 
                style={styles.saveButton}
                onPress={handleSave}
              >
                <ThemedText style={styles.saveButtonText}>Save</ThemedText>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ThemedView>

      <ThemedView style={styles.content}>
        {/* QR Code Preview */}
        <View style={styles.qrSection}>
          <View ref={qrRef} style={styles.qrContainer}>
            <AdvancedQRCodeGenerator
              ref={qrGeneratorRef}
              value={(currentQRCode?.shortUrl || currentQRCode?.short_url || currentQRCode?.url) || ''}
              size={280}
              fgColor={currentQRCode?.options?.foregroundColor || '#000000'}
              bgColor={currentQRCode?.options?.backgroundColor || '#FFFFFF'}
              level={currentQRCode?.options?.errorCorrectionLevel || 'H'}
              cornerRadius={currentQRCode?.options?.cornerRadius || 0}
              gradientColors={currentQRCode?.options?.gradientColors}
              logoOptions={currentQRCode?.options?.logo}
            />
          </View>
        </View>

        {/* QR Code Info */}
        <View style={styles.infoSection}>
          <View style={styles.infoRow}>
            <ThemedText style={styles.label}>Name</ThemedText>
            {editing ? (
              <TextInput
                style={styles.input}
                value={editedQRCode?.name}
                onChangeText={(text) => setEditedQRCode(prev => prev ? {...prev, name: text} : null)}
              />
            ) : (
              <ThemedText style={styles.value}>{currentQRCode?.name}</ThemedText>
            )}
          </View>

          <View style={styles.infoRow}>
            <ThemedText style={styles.label}>Content</ThemedText>
            {editing ? (
              <TextInput
                style={[styles.input, styles.textArea]}
                value={editedQRCode?.url}
                onChangeText={(text) => setEditedQRCode(prev => prev ? {...prev, url: text} : null)}
                multiline
              />
            ) : (
              <ThemedText style={styles.value}>{currentQRCode?.url}</ThemedText>
            )}
          </View>

          <View style={styles.infoRow}>
            <ThemedText style={styles.label}>Description</ThemedText>
            {editing ? (
              <TextInput
                style={[styles.input, styles.textArea]}
                value={editedQRCode?.description}
                onChangeText={(text) => setEditedQRCode(prev => prev ? {...prev, description: text} : null)}
                multiline
                placeholder="Add description..."
              />
            ) : (
              <ThemedText style={styles.value}>
                {currentQRCode?.description || 'No description'}
              </ThemedText>
            )}
          </View>

          <View style={styles.infoRow}>
            <ThemedText style={styles.label}>Created</ThemedText>
            <ThemedText style={styles.value}>
              {new Date(currentQRCode?.createdAt || '').toLocaleDateString()}
            </ThemedText>
          </View>

          <View style={styles.infoRow}>
            <ThemedText style={styles.label}>Scans</ThemedText>
            <ThemedText style={styles.value}>{currentQRCode?.scanCount || 0}</ThemedText>
          </View>

          <View style={styles.infoRow}>
            <ThemedText style={styles.label}>Status</ThemedText>
            {editing ? (
              <Switch
                value={editedQRCode?.isActive}
                onValueChange={(value) => setEditedQRCode(prev => prev ? {...prev, isActive: value} : null)}
              />
            ) : (
              <ThemedText style={[styles.value, currentQRCode?.isActive ? styles.active : styles.inactive]}>
                {currentQRCode?.isActive ? 'Active' : 'Inactive'}
              </ThemedText>
            )}
          </View>
        </View>

        {/* Action Buttons */}
        {!editing && (
          <View style={styles.actionSection}>
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={handleShare}
            >
              <ThemedText style={styles.actionButtonText}>Share</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => handleDownload(QRCodeFormat.PNG)}
            >
              <ThemedText style={styles.actionButtonText}>Download PNG</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => handleDownload(QRCodeFormat.PDF)}
            >
              <ThemedText style={styles.actionButtonText}>Download PDF</ThemedText>
            </TouchableOpacity>

            {(isOwner || isAdmin) && (
              <TouchableOpacity 
                style={[styles.actionButton, styles.deleteButton]}
                onPress={() => {
                  console.log('🗑️ QR Delete: TouchableOpacity onPress triggered');
                  handleDelete();
                }}
              >
                <ThemedText style={[styles.actionButtonText, styles.deleteButtonText]}>
                  Delete
                </ThemedText>
              </TouchableOpacity>
            )}

            {isDelegate && !(qrCode as any)?.deleteRequest?.status && (
              <TouchableOpacity 
                style={[styles.actionButton, styles.requestButton]}
                onPress={handleRequestDelete}
              >
                <ThemedText style={styles.actionButtonText}>Request Delete</ThemedText>
              </TouchableOpacity>
            )}

            {isDelegate && (qrCode as any)?.deleteRequest?.status === 'pending' && (
              <View style={[styles.actionButton, styles.pendingButton]}>
                <ThemedText style={styles.actionButtonText}>Delete Requested</ThemedText>
              </View>
            )}
          </View>
        )}

        {isAdmin && (
          <View style={styles.delegationSection}>
            <ThemedText style={styles.sectionTitle}>Delegate Access</ThemedText>
            {delegateLoading && (
              <ThemedText style={styles.helperText}>Loading delegates...</ThemedText>
            )}

            <TextInput
              style={styles.searchInput}
              placeholder="Search users by email or username"
              placeholderTextColor="#9ca3af"
              value={delegateSearch}
              onChangeText={setDelegateSearch}
            />

            <View style={styles.userList}>
              {filteredUsers.slice(0, 10).map((u) => (
                <TouchableOpacity
                  key={u.id}
                  style={[
                    styles.userOption,
                    selectedDelegateId === u.id && styles.userOptionSelected
                  ]}
                  onPress={() => setSelectedDelegateId(u.id)}
                >
                  <ThemedText style={styles.userOptionText}>{u.username || u.email}</ThemedText>
                  <ThemedText style={styles.userOptionSub}>{u.email}</ThemedText>
                </TouchableOpacity>
              ))}
              {filteredUsers.length === 0 && (
                <ThemedText style={styles.helperText}>No users match your search.</ThemedText>
              )}
            </View>

            <TouchableOpacity
              style={[styles.actionButton, !selectedDelegateId && styles.disabledButton]}
              onPress={handleGrantDelegate}
              disabled={!selectedDelegateId}
            >
              <ThemedText style={styles.actionButtonText}>Grant Access</ThemedText>
            </TouchableOpacity>

            <View style={styles.delegateList}>
              {activeDelegates.length === 0 && (
                <ThemedText style={styles.helperText}>No delegates assigned yet.</ThemedText>
              )}
              {activeDelegates.map((d) => (
                <View key={d.user_id} style={styles.delegateRow}>
                  <View style={styles.delegateInfo}>
                    <ThemedText style={styles.delegateName}>{d.username || d.email}</ThemedText>
                    <ThemedText style={styles.delegateEmail}>{d.email}</ThemedText>
                  </View>
                  <TouchableOpacity
                    style={styles.revokeButton}
                    onPress={() => handleRevokeDelegate(d.user_id)}
                  >
                    <ThemedText style={styles.revokeButtonText}>Revoke</ThemedText>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>
        )}
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    color: '#007BFF',
    fontSize: 16,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  editButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#007BFF',
    borderRadius: 6,
  },
  editButtonText: {
    color: '#007BFF',
  },
  saveButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#007BFF',
    borderRadius: 6,
  },
  saveButtonText: {
    color: '#FFFFFF',
  },
  content: {
    padding: 16,
  },
  qrSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  qrContainer: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  infoSection: {
    marginBottom: 32,
  },
  infoRow: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
    color: '#666',
  },
  value: {
    fontSize: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d0d0d0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  active: {
    color: '#28a745',
    fontWeight: '600',
  },
  inactive: {
    color: '#dc3545',
    fontWeight: '600',
  },
  actionSection: {
    gap: 12,
  },
  actionButton: {
    backgroundColor: '#007BFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: '#dc3545',
  },
  deleteButtonText: {
    color: '#FFFFFF',
  },
  requestButton: {
    backgroundColor: '#f59e0b',
  },
  pendingButton: {
    backgroundColor: '#9ca3af',
  },
  delegationSection: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  helperText: {
    fontSize: 12,
    color: '#6b7280',
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#ffffff',
  },
  userList: {
    gap: 8,
  },
  userOption: {
    padding: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
  userOptionSelected: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  userOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  userOptionSub: {
    fontSize: 12,
    color: '#6b7280',
  },
  disabledButton: {
    opacity: 0.6,
  },
  delegateList: {
    gap: 10,
  },
  delegateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    backgroundColor: '#ffffff',
  },
  delegateInfo: {
    flex: 1,
    marginRight: 12,
  },
  delegateName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  delegateEmail: {
    fontSize: 12,
    color: '#6b7280',
  },
  revokeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#ef4444',
    borderRadius: 6,
  },
  revokeButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
});
