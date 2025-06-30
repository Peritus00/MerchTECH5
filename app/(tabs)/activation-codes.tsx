import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { activationCodesAPI, playlistAPI } from '@/services/api';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';

type TabType = 'generate' | 'myAccess' | 'allGenerated';

interface ActivationCode {
  id: number;
  code: string;
  playlist_id?: number;
  slideshow_id?: number;
  playlist_name?: string;
  slideshow_name?: string;
  content_type: 'playlist' | 'slideshow';
  created_by: number;
  max_uses?: number;
  uses_count: number;
  expires_at?: string;
  is_active: boolean;
  created_at: string;
  attached_at?: string; // For MY ACCESS CODES tab
}

interface Playlist {
  id: number;
  name: string;
  description?: string;
  requires_activation_code: boolean;
}

const ActivationCodesScreen = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('generate');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Generate Codes Tab
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<number | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [maxUses, setMaxUses] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  
  // My Access Codes Tab
  const [myAccessCodes, setMyAccessCodes] = useState<ActivationCode[]>([]);
  const [newCodeInput, setNewCodeInput] = useState('');
  const [isAttaching, setIsAttaching] = useState(false);
  
  // All Generated Codes Tab
  const [allGeneratedCodes, setAllGeneratedCodes] = useState<ActivationCode[]>([]);
  
  // Edit Code Modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCode, setEditingCode] = useState<ActivationCode | null>(null);
  const [editMaxUses, setEditMaxUses] = useState('');
  const [editExpiresInDays, setEditExpiresInDays] = useState('');
  const [editIsActive, setEditIsActive] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      if (activeTab === 'generate') {
        await loadPlaylists();
      } else if (activeTab === 'myAccess') {
        await loadMyAccessCodes();
      } else if (activeTab === 'allGenerated') {
        await loadAllGeneratedCodes();
      }
    } catch (error) {
      console.error('Error loading data:', error);
      Alert.alert('Error', 'Failed to load data');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const loadPlaylists = async () => {
    try {
      console.log('🔑 Loading playlists for code generation');
      const playlistsData = await playlistAPI.getAll();
      setPlaylists(playlistsData);
      console.log('🔑 Loaded', playlistsData.length, 'playlists');
    } catch (error) {
      console.error('🔑 Error loading playlists:', error);
      throw error;
    }
  };

  const loadMyAccessCodes = async () => {
    try {
      console.log('🔑 Loading my access codes');
      const accessCodes = await activationCodesAPI.getMyAccess();
      setMyAccessCodes(accessCodes);
      console.log('🔑 Loaded', accessCodes.length, 'access codes');
    } catch (error) {
      console.error('🔑 Error loading access codes:', error);
      throw error;
    }
  };

  const loadAllGeneratedCodes = async () => {
    try {
      console.log('🔑 Loading all generated codes');
      const generatedCodes = await activationCodesAPI.getGenerated();
      setAllGeneratedCodes(generatedCodes);
      console.log('🔑 Loaded', generatedCodes.length, 'generated codes');
    } catch (error) {
      console.error('🔑 Error loading generated codes:', error);
      throw error;
    }
  };

  const handleCreateCode = async () => {
    if (!selectedPlaylistId) {
      Alert.alert('Error', 'Please select a playlist');
      return;
    }

    setIsCreating(true);
    try {
      const expiresAt = expiresInDays ? 
        new Date(Date.now() + parseInt(expiresInDays) * 24 * 60 * 60 * 1000).toISOString() : 
        undefined;

      console.log('🔑 Creating activation code:', { 
        playlistId: selectedPlaylistId, 
        maxUses: maxUses ? parseInt(maxUses) : undefined, 
        expiresAt 
      });

      await activationCodesAPI.create({
        playlistId: selectedPlaylistId.toString(),
        maxUses: maxUses ? parseInt(maxUses) : undefined,
        expiresAt,
      });

      Alert.alert('Success', 'Activation code created successfully!');
      setShowCreateModal(false);
      setMaxUses('');
      setExpiresInDays('');
      setSelectedPlaylistId(null);
      
      // Refresh the all generated codes if we're on that tab
      if (activeTab === 'allGenerated') {
        await loadAllGeneratedCodes();
      }
    } catch (error) {
      console.error('🔑 Error creating code:', error);
      Alert.alert('Error', 'Failed to create activation code');
    } finally {
      setIsCreating(false);
    }
  };

  const handleAttachCode = async () => {
    if (!newCodeInput.trim()) {
      Alert.alert('Error', 'Please enter an activation code');
      return;
    }

    setIsAttaching(true);
    try {
      console.log('🔑 Attaching activation code:', newCodeInput);
      await activationCodesAPI.attach(newCodeInput.trim());
      Alert.alert('Success', 'Activation code attached to your profile!');
      setNewCodeInput('');
      await loadMyAccessCodes();
    } catch (error: any) {
      console.error('🔑 Error attaching code:', error);
      Alert.alert('Error', error.response?.data?.error || 'Failed to attach activation code');
    } finally {
      setIsAttaching(false);
    }
  };

  const handleDetachCode = async (codeId: number) => {
    Alert.alert(
      'Remove Access Code',
      'Are you sure you want to remove this code from your profile? You will lose access to this content.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('🔑 Detaching activation code:', codeId);
              await activationCodesAPI.detach(codeId.toString());
              Alert.alert('Success', 'Access code removed from your profile');
              await loadMyAccessCodes();
            } catch (error: any) {
              console.error('🔑 Error detaching code:', error);
              Alert.alert('Error', error.response?.data?.error || 'Failed to remove activation code');
            }
          },
        },
      ]
    );
  };

  const handleEditCode = (code: ActivationCode) => {
    setEditingCode(code);
    setEditMaxUses(code.max_uses ? code.max_uses.toString() : '');
    
    // Calculate days until expiration
    if (code.expires_at) {
      const expirationDate = new Date(code.expires_at);
      const now = new Date();
      const daysUntilExpiration = Math.ceil((expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      setEditExpiresInDays(daysUntilExpiration > 0 ? daysUntilExpiration.toString() : '');
    } else {
      setEditExpiresInDays('');
    }
    
    setEditIsActive(code.is_active);
    setShowEditModal(true);
  };

  const handleUpdateCode = async () => {
    if (!editingCode) return;

    setIsUpdating(true);
    try {
      const expiresAt = editExpiresInDays ? 
        new Date(Date.now() + parseInt(editExpiresInDays) * 24 * 60 * 60 * 1000).toISOString() : 
        null;

      console.log('🔑 Updating activation code:', { 
        codeId: editingCode.id, 
        maxUses: editMaxUses ? parseInt(editMaxUses) : null, 
        expiresAt,
        isActive: editIsActive
      });

      await activationCodesAPI.update(editingCode.id.toString(), {
        maxUses: editMaxUses ? parseInt(editMaxUses) : null,
        expiresAt,
        isActive: editIsActive,
      });

      Alert.alert('Success', 'Activation code updated successfully!');
      setShowEditModal(false);
      setEditingCode(null);
      setEditMaxUses('');
      setEditExpiresInDays('');
      setEditIsActive(true);
      
      // Refresh the codes list
      await loadAllGeneratedCodes();
    } catch (error: any) {
      console.error('🔑 Error updating code:', error);
      Alert.alert('Error', error.response?.data?.error || 'Failed to update activation code');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteCode = async (codeId: number) => {
    Alert.alert(
      'Delete Activation Code',
      'Are you sure you want to delete this activation code? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('🔑 Deleting activation code:', codeId);
              await activationCodesAPI.delete(codeId.toString());
              Alert.alert('Success', 'Activation code deleted successfully');
              await loadAllGeneratedCodes();
            } catch (error: any) {
              console.error('🔑 Error deleting code:', error);
              Alert.alert('Error', error.response?.data?.error || 'Failed to delete activation code');
            }
          },
        },
      ]
    );
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const renderTabButton = (tab: TabType, title: string) => (
    <TouchableOpacity
      style={[styles.tabButton, activeTab === tab && styles.activeTabButton]}
      onPress={() => setActiveTab(tab)}
    >
      <Text style={[styles.tabButtonText, activeTab === tab && styles.activeTabButtonText]}>
        {title}
      </Text>
    </TouchableOpacity>
  );

  const renderGenerateTab = () => (
    <View style={styles.tabContent}>
      <ThemedText style={styles.sectionTitle}>Generate Activation Codes</ThemedText>
      <ThemedText style={styles.sectionDescription}>
        Create activation codes for your protected playlists
      </ThemedText>

      <TouchableOpacity
        style={styles.createButton}
        onPress={() => setShowCreateModal(true)}
      >
        <MaterialIcons name="add" size={20} color="#fff" />
        <Text style={styles.createButtonText}>Create New Code</Text>
      </TouchableOpacity>

      {/* Create Code Modal */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Create Activation Code</Text>
            <TouchableOpacity onPress={() => setShowCreateModal(false)}>
              <MaterialIcons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            <Text style={styles.inputLabel}>Select Playlist *</Text>
            <ScrollView style={styles.playlistSelector} showsVerticalScrollIndicator={false}>
              {playlists.filter(p => p.requires_activation_code).map((playlist) => (
                <TouchableOpacity
                  key={playlist.id}
                  style={[
                    styles.playlistOption,
                    selectedPlaylistId === playlist.id && styles.selectedPlaylistOption
                  ]}
                  onPress={() => setSelectedPlaylistId(playlist.id)}
                >
                  <Text style={[
                    styles.playlistOptionText,
                    selectedPlaylistId === playlist.id && styles.selectedPlaylistOptionText
                  ]}>
                    {playlist.name}
                  </Text>
                  {playlist.description && (
                    <Text style={styles.playlistDescription}>{playlist.description}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.inputLabel}>Max Uses (optional)</Text>
            <TextInput
              style={styles.textInput}
              value={maxUses}
              onChangeText={setMaxUses}
              placeholder="Leave empty for unlimited"
              keyboardType="numeric"
            />

            <Text style={styles.inputLabel}>Expires in Days (optional)</Text>
            <TextInput
              style={styles.textInput}
              value={expiresInDays}
              onChangeText={setExpiresInDays}
              placeholder="Leave empty for no expiration"
              keyboardType="numeric"
            />

            <TouchableOpacity
              style={[styles.modalButton, isCreating && styles.disabledButton]}
              onPress={handleCreateCode}
              disabled={isCreating}
            >
              {isCreating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.modalButtonText}>Create Code</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );

  const renderEditModal = () => (
    <Modal
      visible={showEditModal}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Edit Activation Code</Text>
          <TouchableOpacity onPress={() => setShowEditModal(false)}>
            <MaterialIcons name="close" size={24} color="#333" />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalContent}>
          {editingCode && (
            <>
              <View style={styles.codeDisplaySection}>
                <Text style={styles.inputLabel}>Code</Text>
                <Text style={styles.codeDisplay}>{editingCode.code}</Text>
              </View>

              <View style={styles.toggleSection}>
                <Text style={styles.inputLabel}>Status</Text>
                <TouchableOpacity
                  style={[
                    styles.toggleButton,
                    editIsActive ? styles.activeToggle : styles.inactiveToggle
                  ]}
                  onPress={() => setEditIsActive(!editIsActive)}
                >
                  <Text style={[
                    styles.toggleText,
                    editIsActive ? styles.activeToggleText : styles.inactiveToggleText
                  ]}>
                    {editIsActive ? 'Active' : 'Inactive'}
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>Max Uses (optional)</Text>
              <TextInput
                style={styles.textInput}
                value={editMaxUses}
                onChangeText={setEditMaxUses}
                placeholder="Leave empty for unlimited"
                keyboardType="numeric"
              />

              <Text style={styles.inputLabel}>Days Until Expiration (optional)</Text>
              <TextInput
                style={styles.textInput}
                value={editExpiresInDays}
                onChangeText={setEditExpiresInDays}
                placeholder="Leave empty for no expiration"
                keyboardType="numeric"
              />

              <View style={styles.currentStatsSection}>
                <Text style={styles.inputLabel}>Current Statistics</Text>
                <Text style={styles.statText}>
                  Uses: {editingCode.uses_count}{editingCode.max_uses ? `/${editingCode.max_uses}` : ' (unlimited)'}
                </Text>
                <Text style={styles.statText}>
                  Created: {new Date(editingCode.created_at).toLocaleDateString()}
                </Text>
                {editingCode.expires_at && (
                  <Text style={styles.statText}>
                    Current Expiration: {new Date(editingCode.expires_at).toLocaleDateString()}
                  </Text>
                )}
              </View>

              <TouchableOpacity
                style={[styles.modalButton, isUpdating && styles.disabledButton]}
                onPress={handleUpdateCode}
                disabled={isUpdating}
              >
                {isUpdating ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalButtonText}>Update Code</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );

  const renderMyAccessTab = () => (
    <View style={styles.tabContent}>
      <ThemedText style={styles.sectionTitle}>My Access Codes</ThemedText>
      <ThemedText style={styles.sectionDescription}>
        Codes attached to your profile that grant you access to content
      </ThemedText>

      <View style={styles.addCodeSection}>
        <TextInput
          style={styles.codeInput}
          value={newCodeInput}
          onChangeText={setNewCodeInput}
          placeholder="Enter activation code"
          autoCapitalize="characters"
        />
        <TouchableOpacity
          style={[styles.attachButton, isAttaching && styles.disabledButton]}
          onPress={handleAttachCode}
          disabled={isAttaching}
        >
          {isAttaching ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <MaterialIcons name="add" size={20} color="#fff" />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {myAccessCodes.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialIcons name="vpn-key" size={48} color="#ccc" />
            <Text style={styles.emptyStateText}>No access codes attached</Text>
            <Text style={styles.emptyStateSubtext}>
              Enter activation codes above to gain access to protected content
            </Text>
          </View>
        ) : (
          myAccessCodes.map((code) => (
            <View key={code.id} style={styles.codeCard}>
              <View style={styles.codeHeader}>
                <Text style={styles.codeName}>{code.code}</Text>
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => handleDetachCode(code.id)}
                >
                  <MaterialIcons name="remove-circle" size={20} color="#ff4444" />
                </TouchableOpacity>
              </View>
              <Text style={styles.codeContent}>
                {code.content_type === 'playlist' ? code.playlist_name : code.slideshow_name}
              </Text>
              <Text style={styles.codeDetails}>
                Added: {new Date(code.attached_at!).toLocaleDateString()}
                {code.expires_at && ` • Expires: ${new Date(code.expires_at).toLocaleDateString()}`}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );

  const renderAllGeneratedTab = () => (
    <View style={styles.tabContent}>
      <ThemedText style={styles.sectionTitle}>All Generated Codes</ThemedText>
      <ThemedText style={styles.sectionDescription}>
        Every activation code you have created
      </ThemedText>

      <ScrollView showsVerticalScrollIndicator={false}>
        {allGeneratedCodes.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialIcons name="code" size={48} color="#ccc" />
            <Text style={styles.emptyStateText}>No codes generated yet</Text>
            <Text style={styles.emptyStateSubtext}>
              Use the Generate tab to create activation codes for your content
            </Text>
          </View>
        ) : (
          allGeneratedCodes.map((code) => (
            <View key={code.id} style={styles.codeCard}>
              <View style={styles.codeHeader}>
                <Text style={styles.codeName}>{code.code}</Text>
                <View style={styles.codeActions}>
                  <View style={[
                    styles.statusBadge,
                    { backgroundColor: code.is_active ? '#4CAF50' : '#ff4444' }
                  ]}>
                    <Text style={styles.statusText}>
                      {code.is_active ? 'Active' : 'Inactive'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={() => handleEditCode(code)}
                  >
                    <MaterialIcons name="edit" size={18} color="#007AFF" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDeleteCode(code.id)}
                  >
                    <MaterialIcons name="delete" size={18} color="#ff4444" />
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={styles.codeContent}>
                {code.content_type === 'playlist' ? code.playlist_name : code.slideshow_name}
              </Text>
              <Text style={styles.codeDetails}>
                Uses: {code.uses_count}{code.max_uses ? `/${code.max_uses}` : ' (unlimited)'}
                {code.expires_at && ` • Expires: ${new Date(code.expires_at).toLocaleDateString()}`}
              </Text>
              <Text style={styles.codeDate}>
                Created: {new Date(code.created_at).toLocaleDateString()}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );

  if (isLoading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading activation codes...</Text>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText style={styles.title}>Activation Codes</ThemedText>
      </View>

      <View style={styles.tabContainer}>
        {renderTabButton('generate', 'Generate')}
        {renderTabButton('myAccess', 'My Access')}
        {renderTabButton('allGenerated', 'All Generated')}
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {activeTab === 'generate' && renderGenerateTab()}
        {activeTab === 'myAccess' && renderMyAccessTab()}
        {activeTab === 'allGenerated' && renderAllGeneratedTab()}
      </ScrollView>

      {/* Edit Modal */}
      {renderEditModal()}
    </ThemedView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 15,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTabButton: {
    borderBottomColor: '#007AFF',
  },
  tabButtonText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  activeTabButtonText: {
    color: '#007AFF',
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  tabContent: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#333',
  },
  sectionDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
    lineHeight: 20,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginBottom: 20,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  addCodeSection: {
    flexDirection: 'row',
    marginBottom: 20,
    gap: 10,
  },
  codeInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  attachButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 15,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  codeCard: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#eee',
  },
  codeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  codeName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    fontFamily: 'monospace',
  },
  removeButton: {
    padding: 5,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  codeContent: {
    fontSize: 16,
    color: '#333',
    marginBottom: 4,
  },
  codeDetails: {
    fontSize: 14,
    color: '#666',
  },
  codeDate: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 15,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 15,
    fontSize: 16,
    color: '#666',
  },
  disabledButton: {
    opacity: 0.6,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 15,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  playlistSelector: {
    maxHeight: 200,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  playlistOption: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  selectedPlaylistOption: {
    backgroundColor: '#007AFF15',
  },
  playlistOptionText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  selectedPlaylistOptionText: {
    color: '#007AFF',
    fontWeight: '600',
  },
  playlistDescription: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  modalButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 30,
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Edit and Delete Button Styles
  codeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editButton: {
    padding: 6,
    borderRadius: 4,
    backgroundColor: '#f0f8ff',
  },
  deleteButton: {
    padding: 6,
    borderRadius: 4,
    backgroundColor: '#fff0f0',
  },
  // Edit Modal Styles
  codeDisplaySection: {
    marginBottom: 20,
    padding: 15,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
  },
  codeDisplay: {
    fontSize: 20,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    color: '#333',
    marginTop: 5,
  },
  toggleSection: {
    marginBottom: 20,
  },
  toggleButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  activeToggle: {
    backgroundColor: '#4CAF50',
  },
  inactiveToggle: {
    backgroundColor: '#ff4444',
  },
  toggleText: {
    fontSize: 16,
    fontWeight: '600',
  },
  activeToggleText: {
    color: '#fff',
  },
  inactiveToggleText: {
    color: '#fff',
  },
  currentStatsSection: {
    marginTop: 20,
    padding: 15,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
  },
  statText: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
  },
});

export default ActivationCodesScreen;
