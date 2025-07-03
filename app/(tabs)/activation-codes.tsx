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
  Share,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from '@/contexts/AuthContext';
import { activationCodesAPI, playlistAPI, slideshowAPI } from '@/services/api';
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

interface Slideshow {
  id: number;
  userId: number;
  name: string;
  description?: string;
  autoplayInterval: number;
  transition: string;
  requiresActivationCode: boolean;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  uniqueId: string;
  images: Array<{
    id: number;
    slideshowId: number;
    imageUrl: string;
    caption?: string;
    displayOrder: number;
    createdAt: string;
  }>;
}

const ActivationCodesScreen = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('generate');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Generate Codes Tab
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [slideshows, setSlideshows] = useState<Slideshow[]>([]);
  const [selectedContentType, setSelectedContentType] = useState<'playlist' | 'slideshow'>('playlist');
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<number | null>(null);
  const [selectedSlideshowId, setSelectedSlideshowId] = useState<number | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [maxUses, setMaxUses] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  
  // Batch Creation
  const [batchQuantity, setBatchQuantity] = useState('1');
  const [showBatchModal, setShowBatchModal] = useState(false);
  
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

  // Share Modal
  const [showShareModal, setShowShareModal] = useState(false);
  const [sharingCode, setSharingCode] = useState<ActivationCode | null>(null);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  useEffect(() => {
    if (showCreateModal) {
      if (selectedContentType === 'playlist' && playlists.length > 0) {
        setSelectedPlaylistId(playlists[0].id);
      } else if (selectedContentType === 'slideshow' && slideshows.length > 0) {
        setSelectedSlideshowId(slideshows[0].id);
      }
    } else {
      // Reset selections when modal closes
      setSelectedPlaylistId(null);
      setSelectedSlideshowId(null);
    }
  }, [showCreateModal, selectedContentType, playlists, slideshows]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      if (activeTab === 'generate') {
        await Promise.all([loadPlaylists(), loadSlideshows()]);
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

  const loadSlideshows = async () => {
    try {
      console.log('🔑 Loading slideshows for code generation');
      const slideshowsData = await slideshowAPI.getAll();
      console.log('🔑 Raw slideshows data from API:', slideshowsData);
      setSlideshows(slideshowsData);
      console.log('🔑 Loaded', slideshowsData.length, 'slideshows:', slideshowsData);
    } catch (error) {
      console.error('🔑 Error loading slideshows:', error);
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

  // Copy to clipboard functionality
  const handleCopyToClipboard = async (code: string) => {
    try {
      await Clipboard.setStringAsync(code);
      Alert.alert('Copied!', `Activation code "${code}" has been copied to your clipboard.`);
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      Alert.alert('Error', 'Failed to copy to clipboard');
    }
  };

  // Batch creation functionality
  const handleBatchCreate = async () => {
    let contentId: number | null = null;
    let contentType: 'playlist' | 'slideshow' = selectedContentType;
    if (contentType === 'playlist') {
      contentId = selectedPlaylistId;
    } else {
      contentId = selectedSlideshowId;
    }
    if (!contentId) {
      Alert.alert('Error', `Please select a ${contentType}`);
      return;
    }
    const quantity = parseInt(batchQuantity);
    if (isNaN(quantity) || quantity < 1 || quantity > 50) {
      Alert.alert('Error', 'Please enter a valid quantity between 1 and 50');
      return;
    }
    setIsCreating(true);
    try {
      const expiresAt = expiresInDays ? 
        new Date(Date.now() + parseInt(expiresInDays) * 24 * 60 * 60 * 1000).toISOString() : 
        undefined;
      const createdCodes = [];
      for (let i = 0; i < quantity; i++) {
        const createParams: any = {
          maxUses: maxUses ? parseInt(maxUses) : undefined,
          expiresAt,
        };
        if (contentType === 'playlist') {
          createParams.playlistId = contentId.toString();
        } else {
          createParams.slideshowId = contentId.toString();
        }
        console.log('🔑 Creating activation code with params:', createParams);
        const newCode = await activationCodesAPI.create(createParams);
        createdCodes.push(newCode);
      }
      Alert.alert('Success', `${quantity} activation codes created successfully!`);
      setShowBatchModal(false);
      setMaxUses('');
      setExpiresInDays('');
      setBatchQuantity('1');
      setSelectedPlaylistId(null);
      setSelectedSlideshowId(null);
      setSelectedContentType('playlist');
      if (activeTab === 'allGenerated') {
        await loadAllGeneratedCodes();
      }
    } catch (error) {
      console.error('🔑 Error creating batch codes:', error);
      Alert.alert('Error', 'Failed to create activation codes');
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreateCode = async () => {
    Alert.alert('DEBUG', 'Create button pressed!');
    let contentId: number | null = null;
    let contentType: 'playlist' | 'slideshow' = selectedContentType;
    if (contentType === 'playlist') {
      contentId = selectedPlaylistId;
    } else {
      contentId = selectedSlideshowId;
    }
    if (!contentId) {
      Alert.alert('Error', `Please select a ${contentType}`);
      return;
    }
    setIsCreating(true);
    try {
      const expiresAt = expiresInDays ? 
        new Date(Date.now() + parseInt(expiresInDays) * 24 * 60 * 60 * 1000).toISOString() : 
        undefined;
      const createParams: any = {
        maxUses: maxUses ? parseInt(maxUses) : undefined,
        expiresAt,
      };
      if (contentType === 'playlist') {
        createParams.playlistId = contentId.toString();
      } else {
        createParams.slideshowId = contentId.toString();
      }
      console.log('🔑 Creating activation code with params:', createParams);
      await activationCodesAPI.create(createParams);
      Alert.alert('Success', 'Activation code created successfully!');
      setShowCreateModal(false);
      setMaxUses('');
      setExpiresInDays('');
      setSelectedPlaylistId(null);
      setSelectedSlideshowId(null);
      setSelectedContentType('playlist');
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
    console.log('🗑️ DETACH DEBUG: Function called with codeId:', codeId, 'Type:', typeof codeId);
    console.log('🗑️ DETACH DEBUG: Bypassing Alert.alert and using confirm() directly...');
    
    // Use browser confirm dialog directly for testing
    const shouldDetach = confirm('Remove Access Code - Are you sure you want to remove this activation code from your account?');
    
    if (shouldDetach) {
      console.log('🗑️ DETACH DEBUG: User confirmed detach');
      console.log('🗑️ DETACH DEBUG: About to call API with codeId:', codeId);
      console.log('🗑️ DETACH DEBUG: Converting to string:', codeId.toString());
      
      try {
        console.log('🗑️ DETACH DEBUG: Calling activationCodesAPI.detach...');
        const result = await activationCodesAPI.detach(codeId.toString());
        console.log('🗑️ DETACH DEBUG: API call successful, result:', result);
        
        console.log('🗑️ DETACH DEBUG: Showing success message...');
        alert('Success: Activation code removed from your profile');
        
        console.log('🗑️ DETACH DEBUG: Reloading access codes...');
        await loadMyAccessCodes();
        console.log('🗑️ DETACH DEBUG: Access codes reloaded successfully');
        
      } catch (error: any) {
        console.error('🗑️ DETACH DEBUG: ❌ ERROR OCCURRED:');
        console.error('🗑️ DETACH DEBUG: Error object:', error);
        console.error('🗑️ DETACH DEBUG: Error message:', error.message);
        console.error('🗑️ DETACH DEBUG: Error stack:', error.stack);
        
        if (error.response) {
          console.error('🗑️ DETACH DEBUG: Response status:', error.response.status);
          console.error('🗑️ DETACH DEBUG: Response data:', error.response.data);
          console.error('🗑️ DETACH DEBUG: Response headers:', error.response.headers);
        } else if (error.request) {
          console.error('🗑️ DETACH DEBUG: Request made but no response:', error.request);
        } else {
          console.error('🗑️ DETACH DEBUG: Error setting up request:', error.message);
        }
        
        const errorMessage = error.response?.data?.error || error.message || 'Failed to remove activation code';
        console.log('🗑️ DETACH DEBUG: Showing error message:', errorMessage);
        alert('Error: ' + errorMessage);
      }
    } else {
      console.log('🗑️ DETACH DEBUG: User cancelled detach');
    }
  };

  const handleEditCode = (code: ActivationCode) => {
    setEditingCode(code);
    setEditMaxUses(code.max_uses ? code.max_uses.toString() : '');
    setEditExpiresInDays('');
    setEditIsActive(code.is_active);
    setShowEditModal(true);
  };

  const handleUpdateCode = async () => {
    if (!editingCode) return;

    setIsUpdating(true);
    try {
      const updates: any = {
        isActive: editIsActive,
      };

      if (editMaxUses) {
        updates.maxUses = parseInt(editMaxUses);
      }

      if (editExpiresInDays) {
        updates.expiresAt = new Date(Date.now() + parseInt(editExpiresInDays) * 24 * 60 * 60 * 1000).toISOString();
      }

      console.log('🔑 Updating activation code:', editingCode.id, updates);
      await activationCodesAPI.update(editingCode.id.toString(), updates);
      Alert.alert('Success', 'Activation code updated successfully!');
      setShowEditModal(false);
      setEditingCode(null);
      
      // Refresh the appropriate tab
      if (activeTab === 'allGenerated') {
        await loadAllGeneratedCodes();
      } else if (activeTab === 'myAccess') {
        await loadMyAccessCodes();
      }
    } catch (error: any) {
      console.error('🔑 Error updating code:', error);
      Alert.alert('Error', error.response?.data?.error || 'Failed to update activation code');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteCode = async (codeId: number) => {
    console.log('🗑️ DELETE DEBUG: Function called with codeId:', codeId, 'Type:', typeof codeId);
    console.log('🗑️ DELETE DEBUG: Bypassing Alert.alert and using confirm() directly...');
    
    // Use browser confirm dialog directly for testing
    const shouldDelete = confirm('Delete Activation Code - Are you sure you want to delete this activation code? This action cannot be undone.');
    
    if (shouldDelete) {
      console.log('🗑️ DELETE DEBUG: User confirmed deletion');
      console.log('🗑️ DELETE DEBUG: About to call API with codeId:', codeId);
      console.log('🗑️ DELETE DEBUG: Converting to string:', codeId.toString());
      
      try {
        console.log('🗑️ DELETE DEBUG: Calling activationCodesAPI.delete...');
        const result = await activationCodesAPI.delete(codeId.toString());
        console.log('🗑️ DELETE DEBUG: API call successful, result:', result);
        
        console.log('🗑️ DELETE DEBUG: Showing success message...');
        alert('Success: Activation code deleted successfully');
        
        console.log('🗑️ DELETE DEBUG: Reloading generated codes...');
        await loadAllGeneratedCodes();
        console.log('🗑️ DELETE DEBUG: Generated codes reloaded successfully');
        
      } catch (error: any) {
        console.error('🗑️ DELETE DEBUG: ❌ ERROR OCCURRED:');
        console.error('🗑️ DELETE DEBUG: Error object:', error);
        console.error('🗑️ DELETE DEBUG: Error message:', error.message);
        console.error('🗑️ DELETE DEBUG: Error stack:', error.stack);
        
        if (error.response) {
          console.error('🗑️ DELETE DEBUG: Response status:', error.response.status);
          console.error('🗑️ DELETE DEBUG: Response data:', error.response.data);
          console.error('🗑️ DELETE DEBUG: Response headers:', error.response.headers);
        } else if (error.request) {
          console.error('🗑️ DELETE DEBUG: Request made but no response:', error.request);
        } else {
          console.error('🗑️ DELETE DEBUG: Error setting up request:', error.message);
        }
        
        const errorMessage = error.response?.data?.error || error.message || 'Failed to delete activation code';
        console.log('🗑️ DELETE DEBUG: Showing error message:', errorMessage);
        alert('Error: ' + errorMessage);
      }
    } else {
      console.log('🗑️ DELETE DEBUG: User cancelled deletion');
    }
  };

  // Share functionality
  const handleShareCode = (code: ActivationCode) => {
    setSharingCode(code);
    setShowShareModal(true);
  };

  const shareViaBuiltIn = async (message: string) => {
    try {
      const shareOptions: any = {
        message: message,
        title: 'Activation Code',
      };

      // On iOS, add URL to make it more shareable across social platforms
      if (Platform.OS === 'ios') {
        shareOptions.url = 'https://your-app-website.com'; // Replace with your actual website
        shareOptions.subject = 'Your Activation Code';
      }

      const result = await Share.share(shareOptions);

      if (result.action === Share.sharedAction) {
        Alert.alert('Shared!', 'Activation code shared successfully');
        setShowShareModal(false);
      }
    } catch (error) {
      console.error('Error sharing:', error);
      Alert.alert('Error', 'Failed to share activation code');
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const renderTabButton = (tab: TabType, title: string) => (
    <TouchableOpacity
      key={tab}
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
      <ThemedText style={styles.sectionTitle}>Generate New Codes</ThemedText>
      <ThemedText style={styles.sectionDescription}>
        Create activation codes for your playlists and slideshows
      </ThemedText>

      {/* Single Code Creation */}
      <TouchableOpacity
        style={styles.createButton}
        onPress={() => {
          console.log('🟢 Opening create modal. Current slideshows:', slideshows);
          setIsCreating(false);
          setShowCreateModal(true);
        }}
      >
        <MaterialIcons name="add" size={20} color="#fff" />
        <Text style={styles.createButtonText}>Create Single Code</Text>
      </TouchableOpacity>

      {/* Batch Code Creation */}
      <TouchableOpacity
        style={[styles.createButton, styles.batchButton]}
        onPress={() => setShowBatchModal(true)}
      >
        <MaterialIcons name="add-circle-outline" size={20} color="#fff" />
        <Text style={styles.createButtonText}>Create Multiple Codes</Text>
      </TouchableOpacity>

      {/* Create Modal */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCreateModal(false)}
      >
        {console.log('🟢 Modal opened. slideshows:', slideshows, 'selectedContentType:', selectedContentType)}
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create Activation Code</Text>
            
            <Text style={styles.label}>Select Content:</Text>
            <ScrollView style={styles.playlistSelector} showsVerticalScrollIndicator={false}>
              <TouchableOpacity
                style={[
                  styles.playlistOption,
                  selectedContentType === 'playlist' && styles.selectedPlaylistOption
                ]}
                onPress={() => {
                  console.log('🟢 Content type changed to: playlist');
                  setSelectedContentType('playlist');
                }}
              >
                <Text style={[
                  styles.playlistOptionText,
                  selectedContentType === 'playlist' && styles.selectedPlaylistOptionText
                ]}>
                  Playlist
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.playlistOption,
                  selectedContentType === 'slideshow' && styles.selectedPlaylistOption
                ]}
                onPress={() => {
                  console.log('🟢 Content type changed to: slideshow');
                  console.log('🟢 Current slideshows state:', slideshows);
                  setSelectedContentType('slideshow');
                }}
              >
                <Text style={[
                  styles.playlistOptionText,
                  selectedContentType === 'slideshow' && styles.selectedPlaylistOptionText
                ]}>
                  Slideshow
                </Text>
              </TouchableOpacity>
            </ScrollView>

            {selectedContentType === 'playlist' && (
              <>
                <Text style={styles.label}>Select Playlist:</Text>
                <ScrollView style={styles.playlistSelector} showsVerticalScrollIndicator={false}>
                  {playlists.map((playlist) => (
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
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            {selectedContentType === 'slideshow' && (
              <>
                <Text style={styles.label}>Select Slideshow:</Text>
                {console.log('🟢 Rendering slideshow selection. slideshows:', slideshows)}
                <ScrollView style={styles.playlistSelector} showsVerticalScrollIndicator={false}>
                  {slideshows && slideshows.length > 0 ? (
                    slideshows.map((slideshow) => {
                      console.log('🟢 Rendering slideshow option:', slideshow);
                      return (
                        <TouchableOpacity
                          key={slideshow.id}
                          style={[
                            styles.playlistOption,
                            selectedSlideshowId === slideshow.id && styles.selectedPlaylistOption
                          ]}
                          onPress={() => {
                            console.log('🟢 Slideshow selected:', slideshow);
                            setSelectedSlideshowId(slideshow.id);
                          }}
                        >
                          <Text style={[
                            styles.playlistOptionText,
                            selectedSlideshowId === slideshow.id && styles.selectedPlaylistOptionText
                          ]}>
                            {slideshow.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })
                  ) : (
                    <View style={styles.emptyState}>
                      <Text style={styles.emptyStateText}>No slideshows available</Text>
                      <Text style={styles.emptyStateSubtext}>Create a slideshow first to generate activation codes</Text>
                    </View>
                  )}
                </ScrollView>
              </>
            )}

            <Text style={styles.label}>Max Uses (optional):</Text>
            <TextInput
              style={styles.input}
              value={maxUses}
              onChangeText={setMaxUses}
              placeholder="Leave empty for unlimited"
              keyboardType="numeric"
            />

            <Text style={styles.label}>Expires in days (optional):</Text>
            <TextInput
              style={styles.input}
              value={expiresInDays}
              onChangeText={setExpiresInDays}
              placeholder="Leave empty for no expiration"
              keyboardType="numeric"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowCreateModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.createButton, isCreating && styles.disabledButton, (!selectedPlaylistId && selectedContentType==='playlist') || (!selectedSlideshowId && selectedContentType==='slideshow') ? styles.disabledButton : null]}
                onPress={handleCreateCode}
                disabled={isCreating || (selectedContentType==='playlist' ? !selectedPlaylistId : !selectedSlideshowId)}
              >
                {isCreating ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.createButtonText}>Create</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Batch Create Modal */}
      <Modal
        visible={showBatchModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowBatchModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create Multiple Activation Codes</Text>
            
            <Text style={styles.label}>Quantity (1-50):</Text>
            <TextInput
              style={styles.input}
              value={batchQuantity}
              onChangeText={setBatchQuantity}
              placeholder="How many codes to create?"
              keyboardType="numeric"
            />

            <Text style={styles.label}>Select Content:</Text>
            <ScrollView style={styles.playlistSelector} showsVerticalScrollIndicator={false}>
              <TouchableOpacity
                style={[
                  styles.playlistOption,
                  selectedContentType === 'playlist' && styles.selectedPlaylistOption
                ]}
                onPress={() => setSelectedContentType('playlist')}
              >
                <Text style={[
                  styles.playlistOptionText,
                  selectedContentType === 'playlist' && styles.selectedPlaylistOptionText
                ]}>
                  Playlist
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.playlistOption,
                  selectedContentType === 'slideshow' && styles.selectedPlaylistOption
                ]}
                onPress={() => setSelectedContentType('slideshow')}
              >
                <Text style={[
                  styles.playlistOptionText,
                  selectedContentType === 'slideshow' && styles.selectedPlaylistOptionText
                ]}>
                  Slideshow
                </Text>
              </TouchableOpacity>
            </ScrollView>

            {selectedContentType === 'playlist' && (
              <>
                <Text style={styles.label}>Max Uses per code (optional):</Text>
                <TextInput
                  style={styles.input}
                  value={maxUses}
                  onChangeText={setMaxUses}
                  placeholder="Leave empty for unlimited"
                  keyboardType="numeric"
                />
              </>
            )}

            {selectedContentType === 'slideshow' && (
              <>
                <Text style={styles.label}>Max Uses per code (optional):</Text>
                <TextInput
                  style={styles.input}
                  value={maxUses}
                  onChangeText={setMaxUses}
                  placeholder="Leave empty for unlimited"
                  keyboardType="numeric"
                />
              </>
            )}

            <Text style={styles.label}>Expires in days (optional):</Text>
            <TextInput
              style={styles.input}
              value={expiresInDays}
              onChangeText={setExpiresInDays}
              placeholder="Leave empty for no expiration"
              keyboardType="numeric"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowBatchModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.createButton, isCreating && styles.disabledButton]}
                onPress={handleBatchCreate}
                disabled={isCreating}
              >
                {isCreating ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.createButtonText}>Create {batchQuantity} Codes</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );

  const renderMyAccessTab = () => (
    <View style={styles.tabContent}>
      <ThemedText style={styles.sectionTitle}>My Access Codes</ThemedText>
      <ThemedText style={styles.sectionDescription}>
        Activation codes attached to your profile
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
          style={styles.attachButton}
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
              Enter an activation code above to unlock content
            </Text>
          </View>
        ) : (
          myAccessCodes.map((code) => (
            <View key={code.id} style={styles.codeCard}>
              <View style={styles.codeHeader}>
                <Text style={styles.codeName}>{code.code}</Text>
                <View style={styles.codeActions}>
                  <TouchableOpacity
                    style={styles.copyButton}
                    onPress={() => handleCopyToClipboard(code.code)}
                  >
                    <MaterialIcons name="content-copy" size={18} color="#007AFF" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.shareButton}
                    onPress={() => handleShareCode(code)}
                  >
                    <MaterialIcons name="share" size={18} color="#4CAF50" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => handleDetachCode(code.id)}
                  >
                    <MaterialIcons name="remove" size={18} color="#ff4444" />
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
                Attached: {new Date(code.attached_at || code.created_at).toLocaleDateString()}
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
                <View style={styles.codeTypeBadge}>
                  <Text style={styles.codeTypeText}>
                    {code.content_type === 'playlist' ? 'Playlist' : 'Slideshow'}
                  </Text>
                </View>
                <View style={styles.codeActions}>
                  <TouchableOpacity
                    style={styles.copyButton}
                    onPress={() => handleCopyToClipboard(code.code)}
                  >
                    <MaterialIcons name="content-copy" size={18} color="#007AFF" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.shareButton}
                    onPress={() => handleShareCode(code)}
                  >
                    <MaterialIcons name="share" size={18} color="#4CAF50" />
                  </TouchableOpacity>
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

  const renderEditModal = () => (
    <Modal
      visible={showEditModal}
      animationType="slide"
      transparent
      onRequestClose={() => setShowEditModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Edit Activation Code</Text>
          
          {editingCode && (
            <>
              <View style={styles.codeDisplaySection}>
                <Text style={styles.label}>Code:</Text>
                <Text style={styles.codeDisplay}>{editingCode.code}</Text>
              </View>

              <View style={styles.toggleSection}>
                <Text style={styles.label}>Status:</Text>
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

              <Text style={styles.label}>Max Uses (optional):</Text>
              <TextInput
                style={styles.input}
                value={editMaxUses}
                onChangeText={setEditMaxUses}
                placeholder="Leave empty for unlimited"
                keyboardType="numeric"
              />

              <Text style={styles.label}>Days Until Expiration (optional):</Text>
              <TextInput
                style={styles.input}
                value={editExpiresInDays}
                onChangeText={setEditExpiresInDays}
                placeholder="Leave empty for no expiration"
                keyboardType="numeric"
              />

              <View style={styles.currentStatsSection}>
                <Text style={styles.label}>Current Statistics:</Text>
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

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setShowEditModal(false)}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.createButton, isUpdating && styles.disabledButton]}
                  onPress={handleUpdateCode}
                  disabled={isUpdating}
                >
                  {isUpdating ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.createButtonText}>Update</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );

  const renderShareModal = () => (
    <Modal
      visible={showShareModal}
      animationType="slide"
      transparent
      onRequestClose={() => setShowShareModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Share Activation Code</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowShareModal(false)}
            >
              <MaterialIcons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>
          
          {sharingCode && (
            <>
              <View style={styles.shareCodeSection}>
                <Text style={styles.label}>Code:</Text>
                <Text style={styles.codeDisplay}>{sharingCode.code}</Text>
                <Text style={styles.label}>Content:</Text>
                <Text style={styles.shareMessage}>
                  {sharingCode.content_type === 'playlist' ? sharingCode.playlist_name : sharingCode.slideshow_name}
                </Text>
              </View>

              <Text style={styles.shareInstructions}>
                Share this activation code with your customer via any app:
              </Text>

              <View style={styles.shareOptions}>
                <TouchableOpacity
                  style={[styles.shareOptionButton, styles.primaryShareButton]}
                  onPress={() => shareViaBuiltIn(`🎵 Here's your activation code: ${sharingCode.code}\n\nUse this code to access: ${sharingCode.content_type === 'playlist' ? sharingCode.playlist_name : sharingCode.slideshow_name}\n\nEnjoy your content!`)}
                >
                  <MaterialIcons name="share" size={24} color="#fff" />
                  <Text style={[styles.shareOptionText, styles.primaryShareText]}>Share via Apps</Text>
                  <Text style={styles.shareOptionSubtext}>Email, Messages, WhatsApp, etc.</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.shareOptionButton}
                  onPress={() => handleCopyToClipboard(`🎵 Here's your activation code: ${sharingCode.code}\n\nUse this code to access: ${sharingCode.content_type === 'playlist' ? sharingCode.playlist_name : sharingCode.slideshow_name}\n\nEnjoy your content!`)}
                >
                  <MaterialIcons name="content-copy" size={24} color="#4CAF50" />
                  <Text style={styles.shareOptionText}>Copy Full Message</Text>
                  <Text style={styles.shareOptionSubtext}>Copy and paste anywhere</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.shareOptionButton}
                  onPress={() => handleCopyToClipboard(sharingCode.code)}
                >
                  <MaterialIcons name="vpn-key" size={24} color="#FF9500" />
                  <Text style={styles.shareOptionText}>Copy Code Only</Text>
                  <Text style={styles.shareOptionSubtext}>Just the activation code</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.shareHint}>
                <MaterialIcons name="info" size={16} color="#666" />
                <Text style={styles.shareHintText}>
                  Available apps depend on what's installed on your device. 
                  Make sure you have Mail app configured for email sharing.
                </Text>
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setShowShareModal(false)}
                >
                  <Text style={styles.cancelButtonText}>Close</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
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

      {/* Share Modal */}
      {renderShareModal()}
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
    marginBottom: 12,
  },
  batchButton: {
    backgroundColor: '#4CAF50',
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
    flex: 1,
  },
  codeTypeBadge: {
    padding: 4,
    borderRadius: 8,
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  codeTypeText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  codeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  copyButton: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#E3F2FD',
  },
  shareButton: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#E8F5E8',
  },
  removeButton: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#FFEBEE',
  },
  editButton: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#E3F2FD',
  },
  deleteButton: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#FFEBEE',
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
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    lineHeight: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 10,
    maxWidth: '90%',
    maxHeight: '80%',
    minWidth: 300,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
    textAlign: 'center',
  },
  closeButton: {
    padding: 4,
    borderRadius: 20,
    backgroundColor: '#f8f9fa',
    position: 'absolute',
    right: 0,
    top: -2,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    marginBottom: 8,
  },
  playlistSelector: {
    maxHeight: 150,
    marginBottom: 8,
  },
  playlistOption: {
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  selectedPlaylistOption: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  playlistOptionText: {
    fontSize: 16,
    color: '#333',
  },
  selectedPlaylistOptionText: {
    color: '#fff',
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    gap: 10,
  },
  cancelButton: {
    backgroundColor: '#6c757d',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    flex: 1,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.5,
  },
  // Edit Modal Specific Styles
  codeDisplaySection: {
    marginBottom: 15,
  },
  codeDisplay: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#007AFF',
    fontFamily: 'monospace',
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    textAlign: 'center',
  },
  toggleSection: {
    marginBottom: 15,
  },
  toggleButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
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
    backgroundColor: '#f8f9fa',
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
  },
  statText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  // Share Modal Specific Styles
  shareCodeSection: {
    marginBottom: 20,
  },
  shareMessage: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    textAlign: 'center',
  },
  shareInstructions: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 22,
  },
  shareOptions: {
    gap: 12,
    marginBottom: 20,
  },
  shareOptionButton: {
    alignItems: 'center',
    padding: 15,
    borderRadius: 8,
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  primaryShareButton: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  shareOptionText: {
    fontSize: 16,
    color: '#333',
    marginTop: 8,
    fontWeight: '600',
  },
  primaryShareText: {
    color: '#fff',
  },
  shareOptionSubtext: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  shareHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
  },
  shareHintText: {
    fontSize: 12,
    color: '#666',
    marginLeft: 8,
    flex: 1,
    lineHeight: 16,
  },
});

class ErrorBoundary extends React.Component<any, { hasError: boolean; error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(error: any, errorInfo: any) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 }}>
          <Text style={{ color: 'red', fontWeight: 'bold', fontSize: 18 }}>A rendering error occurred:</Text>
          <Text selectable style={{ color: '#333', marginTop: 20 }}>{String(this.state.error)}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const ActivationCodesScreenWithBoundary = (props: any) => (
  <ErrorBoundary>
    <ActivationCodesScreen {...props} />
  </ErrorBoundary>
);

export default ActivationCodesScreenWithBoundary;
export { ActivationCodesScreen };
