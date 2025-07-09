import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Playlist, MediaFile } from '@/shared/media-schema';
import MediaSelectionList from './MediaSelectionList';

interface EditPlaylistModalProps {
  visible: boolean;
  onClose: () => void;
  onUpdatePlaylist: (playlist: Playlist) => void;
  playlist: Playlist | null;
  allMediaFiles: MediaFile[];
}

const EditPlaylistModal: React.FC<EditPlaylistModalProps> = ({
  visible,
  onClose,
  onUpdatePlaylist,
  playlist,
  allMediaFiles,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [playlistMediaFiles, setPlaylistMediaFiles] = useState<MediaFile[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'media' | 'add-media'>('details');

  useEffect(() => {
    if (playlist && visible) {
      console.log('🔴 EDIT_PLAYLIST: Loading playlist data:', {
        id: playlist.id,
        name: playlist.name,
        mediaFiles: playlist.mediaFiles?.length || 0
      });
      
      setName(playlist.name || '');
      setDescription(playlist.description || '');
      setPlaylistMediaFiles(playlist.mediaFiles || []);
    }
  }, [playlist, visible]);

  const handleUpdatePlaylist = async () => {
    if (!playlist || !name.trim()) {
      Alert.alert('Error', 'Please enter a playlist name');
      return;
    }

    setIsUpdating(true);
    console.log('🔴 EDIT_PLAYLIST: Updating playlist with data:', {
      id: playlist.id,
      name: name.trim(),
      description: description.trim(),
      mediaFiles: playlistMediaFiles.length
    });

    try {
      const { playlistAPI } = await import('@/services/api');

      // Update playlist details
      const updatedPlaylist = await playlistAPI.update(playlist.id, {
        name: name.trim(),
        description: description.trim() || undefined,
      });

      console.log('🔴 EDIT_PLAYLIST: Playlist details updated:', updatedPlaylist);

      // Update media files if changed
      const currentMediaIds = playlist.mediaFiles?.map(f => f.id) || [];
      const newMediaIds = playlistMediaFiles.map(f => f.id);
      
      if (JSON.stringify(currentMediaIds.sort()) !== JSON.stringify(newMediaIds.sort())) {
        console.log('🔴 EDIT_PLAYLIST: Media files changed, updating...');
        
        // For now, we'll replace all media files
        // TODO: Implement more granular add/remove operations
        await playlistAPI.updateMedia(playlist.id, newMediaIds);
        console.log('🔴 EDIT_PLAYLIST: Media files updated');
      }

      // Fetch the complete updated playlist from server to ensure consistency
      console.log('🔴 EDIT_PLAYLIST: Fetching complete updated playlist from server...');
      const completeUpdatedPlaylist = await playlistAPI.getById(playlist.id);
      
      console.log('🔴 EDIT_PLAYLIST: Complete updated playlist from server:', completeUpdatedPlaylist);
      onUpdatePlaylist(completeUpdatedPlaylist);
      onClose();

    } catch (error: any) {
      console.error('🔴 EDIT_PLAYLIST: Error updating playlist:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to update playlist';
      Alert.alert('Error', errorMessage);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleClose = () => {
    setName('');
    setDescription('');
    setPlaylistMediaFiles([]);
    setActiveTab('details');
    setIsUpdating(false);
    onClose();
  };

  const moveMediaFile = (fromIndex: number, toIndex: number) => {
    console.log('🔴 EDIT_PLAYLIST: Moving media file from', fromIndex, 'to', toIndex);
    
    const newMediaFiles = [...playlistMediaFiles];
    const [movedFile] = newMediaFiles.splice(fromIndex, 1);
    newMediaFiles.splice(toIndex, 0, movedFile);
    
    setPlaylistMediaFiles(newMediaFiles);
  };

  const removeMediaFile = (mediaId: number) => {
    console.log('🔴 EDIT_PLAYLIST: Removing media file:', mediaId);
    setPlaylistMediaFiles(prev => prev.filter(f => f.id !== mediaId));
  };

  const addMediaFiles = (mediaIds: number[]) => {
    console.log('🔴 EDIT_PLAYLIST: Adding media files:', mediaIds);
    
    const newMediaFiles = allMediaFiles.filter(file => 
      mediaIds.includes(file.id) && !playlistMediaFiles.some(pf => pf.id === file.id)
    );
    
    setPlaylistMediaFiles(prev => [...prev, ...newMediaFiles]);
    setActiveTab('media');
  };

  const getMediaTypeIcon = (mediaFile: MediaFile) => {
    if (mediaFile.contentType?.startsWith('audio/')) return 'audiotrack';
    if (mediaFile.contentType?.startsWith('video/')) return 'videocam';
    if (mediaFile.contentType?.startsWith('image/')) return 'image';
    return 'insert-drive-file';
  };

  const availableMediaFiles = allMediaFiles.filter(file => 
    !playlistMediaFiles.some(pf => pf.id === file.id)
  );

  if (!playlist) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose}>
            <MaterialIcons name="close" size={24} color="#1f2937" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Playlist</Text>
          <TouchableOpacity 
            onPress={handleUpdatePlaylist}
            disabled={!name.trim() || isUpdating}
          >
            <Text style={[
              styles.saveButton,
              (!name.trim() || isUpdating) && styles.saveButtonDisabled
            ]}>
              {isUpdating ? 'Saving...' : 'Save'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tab Navigation */}
        <View style={styles.tabContainer}>
          {[
            { key: 'details', label: 'Details', icon: 'info' },
            { key: 'media', label: `Media (${playlistMediaFiles.length})`, icon: 'queue-music' },
            { key: 'add-media', label: 'Add Media', icon: 'add' },
          ].map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.tab,
                activeTab === tab.key && styles.activeTab,
              ]}
              onPress={() => setActiveTab(tab.key as any)}
            >
              <MaterialIcons 
                name={tab.icon as any} 
                size={16} 
                color={activeTab === tab.key ? '#3b82f6' : '#6b7280'} 
              />
              <Text style={[
                styles.tabText,
                activeTab === tab.key && styles.activeTabText,
              ]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Content */}
        <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
          {activeTab === 'details' && (
            <View style={styles.detailsTab}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Playlist Name *</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="Enter playlist name"
                  placeholderTextColor="#9ca3af"
                  maxLength={100}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Description</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Optional description"
                  placeholderTextColor="#9ca3af"
                  multiline
                  numberOfLines={4}
                  maxLength={500}
                />
              </View>

              <View style={styles.infoBox}>
                <MaterialIcons name="info" size={16} color="#3b82f6" />
                <Text style={styles.infoText}>
                  Use the Media tab to reorder tracks or the Add Media tab to add new files.
                </Text>
              </View>
            </View>
          )}

          {activeTab === 'media' && (
            <View style={styles.mediaTab}>
              <Text style={styles.sectionTitle}>Current Media Files</Text>
              
              {playlistMediaFiles.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <MaterialIcons name="queue-music" size={48} color="#9ca3af" />
                  <Text style={styles.emptyText}>No media files in this playlist</Text>
                  <Text style={styles.emptySubtext}>Use the "Add Media" tab to add files</Text>
                </View>
              ) : (
                playlistMediaFiles.map((file, index) => (
                  <View key={file.id} style={styles.mediaItem}>
                    <View style={styles.mediaItemLeft}>
                      <View style={styles.dragHandle}>
                        <MaterialIcons name="drag-handle" size={20} color="#9ca3af" />
                      </View>
                      <View style={styles.mediaItemContent}>
                        <MaterialIcons
                          name={getMediaTypeIcon(file)}
                          size={20}
                          color="#6b7280"
                        />
                        <View style={styles.mediaItemText}>
                          <Text style={styles.mediaItemTitle} numberOfLines={1}>
                            {file.title}
                          </Text>
                          <Text style={styles.mediaItemSubtitle} numberOfLines={1}>
                            {file.contentType}
                          </Text>
                        </View>
                      </View>
                    </View>
                    
                    <View style={styles.mediaItemActions}>
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => moveMediaFile(index, Math.max(0, index - 1))}
                        disabled={index === 0}
                      >
                        <MaterialIcons 
                          name="keyboard-arrow-up" 
                          size={20} 
                          color={index === 0 ? '#d1d5db' : '#6b7280'} 
                        />
                      </TouchableOpacity>
                      
                      <TouchableOpacity
                        style={styles.actionButton}
                        onPress={() => moveMediaFile(index, Math.min(playlistMediaFiles.length - 1, index + 1))}
                        disabled={index === playlistMediaFiles.length - 1}
                      >
                        <MaterialIcons 
                          name="keyboard-arrow-down" 
                          size={20} 
                          color={index === playlistMediaFiles.length - 1 ? '#d1d5db' : '#6b7280'} 
                        />
                      </TouchableOpacity>
                      
                      <TouchableOpacity
                        style={[styles.actionButton, styles.removeButton]}
                        onPress={() => removeMediaFile(file.id)}
                      >
                        <MaterialIcons name="remove" size={20} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}

          {activeTab === 'add-media' && (
            <View style={styles.addMediaTab}>
              <Text style={styles.sectionTitle}>Available Media Files</Text>
              
              {availableMediaFiles.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <MaterialIcons name="library-add" size={48} color="#9ca3af" />
                  <Text style={styles.emptyText}>No available media files</Text>
                  <Text style={styles.emptySubtext}>All your media files are already in this playlist</Text>
                </View>
              ) : (
                <MediaSelectionList
                  mediaFiles={availableMediaFiles}
                  selectedMediaIds={[]}
                  onToggleSelection={(mediaId) => addMediaFiles([mediaId])}
                />
              )}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
  },
  saveButton: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3b82f6',
  },
  saveButtonDisabled: {
    color: '#9ca3af',
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    gap: 6,
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#3b82f6',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
  },
  activeTabText: {
    color: '#3b82f6',
  },
  content: {
    flex: 1,
  },
  detailsTab: {
    padding: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#1f2937',
    backgroundColor: '#fff',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#1e40af',
  },
  mediaTab: {
    padding: 16,
  },
  addMediaTab: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 16,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#6b7280',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 4,
  },
  mediaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    marginBottom: 8,
  },
  mediaItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  dragHandle: {
    marginRight: 12,
  },
  mediaItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  mediaItemText: {
    flex: 1,
  },
  mediaItemTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1f2937',
  },
  mediaItemSubtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  mediaItemActions: {
    flexDirection: 'row',
    gap: 4,
  },
  actionButton: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  removeButton: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
});

export default EditPlaylistModal; 