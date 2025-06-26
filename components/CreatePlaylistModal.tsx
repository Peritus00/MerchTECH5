import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { MediaFile } from '@/shared/media-schema';
import MediaSelectionList from './MediaSelectionList';

interface CreatePlaylistModalProps {
  visible: boolean;
  onClose: () => void;
  onCreatePlaylist: (name: string, description: string, mediaIds: number[]) => void;
  mediaFiles: MediaFile[];
}

const CreatePlaylistModal: React.FC<CreatePlaylistModalProps> = ({
  visible,
  onClose,
  onCreatePlaylist,
  mediaFiles,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedMediaIds, setSelectedMediaIds] = useState<number[]>([]);
  const [step, setStep] = useState<'details' | 'media'>('details');

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a playlist name');
      return;
    }

    setIsCreating(true);
    try {
      console.log('🔴 CreatePlaylistModal: Creating playlist with API...');

      const { playlistAPI } = await import('@/services/api');

      const playlistData = {
        name: name.trim(),
        description: description.trim() || undefined,
        mediaFileIds: selectedMediaIds.length > 0 ? selectedMediaIds : undefined,
        requiresActivationCode,
        isPublic,
      };

      console.log('🔴 CreatePlaylistModal: Playlist data:', playlistData);

      const newPlaylist = await playlistAPI.create(playlistData);
      console.log('🔴 CreatePlaylistModal: API response:', newPlaylist);

      // Add the selected media files to the playlist object for immediate UI update
      const playlistWithMedia: Playlist = {
        ...newPlaylist,
        mediaFiles: selectedMediaIds.length > 0 
          ? mediaFiles.filter(file => selectedMediaIds.includes(file.id))
          : [],
      };

      console.log('🔴 CreatePlaylistModal: Created playlist:', playlistWithMedia);
      onPlaylistCreated(playlistWithMedia);
      onClose();

      // Reset form
      setName('');
      setDescription('');
      setRequiresActivationCode(false);
      setIsPublic(false);
      setSelectedMediaIds([]);
    } catch (error: any) {
      console.error('🔴 CreatePlaylistModal: Error creating playlist:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to create playlist';
      Alert.alert('Error', errorMessage);
    } finally {
      setIsCreating(false);
    }
  };

  const resetForm = () => {
    setName('');
    setDescription('');
    setSelectedMediaIds([]);
    setStep('details');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const toggleMediaSelection = (mediaId: number) => {
    setSelectedMediaIds(prev => 
      prev.includes(mediaId)
        ? prev.filter(id => id !== mediaId)
        : [...prev, mediaId]
    );
  };

  const handleNext = () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a playlist name');
      return;
    }
    setStep('media');
  };

  const handleBack = () => {
    setStep('details');
  };

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
          <TouchableOpacity onPress={step === 'details' ? handleClose : handleBack}>
            <MaterialIcons 
              name={step === 'details' ? 'close' : 'arrow-back'} 
              size={24} 
              color="#1f2937" 
            />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {step === 'details' ? 'Create Playlist' : 'Select Media'}
          </Text>
          <TouchableOpacity 
            onPress={step === 'details' ? handleNext : handleCreate}
            disabled={!name.trim()}
          >
            <Text style={[
              styles.headerAction,
              (!name.trim()) && styles.headerActionDisabled
            ]}>
              {step === 'details' ? 'Next' : 'Create'}
            </Text>
          </TouchableOpacity>
        </View>

        {step === 'details' ? (
          // Step 1: Playlist Details
          <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.form}>
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
                  You can add media files in the next step, or add them later by editing the playlist.
                </Text>
              </View>
            </View>
          </ScrollView>
        ) : (
          // Step 2: Media Selection
          <View style={styles.content}>
            <View style={styles.selectionHeader}>
              <Text style={styles.selectionTitle}>
                Choose media files for your playlist
              </Text>
              <Text style={styles.selectionSubtitle}>
                {selectedMediaIds.length} selected
              </Text>
            </View>
            <MediaSelectionList
              mediaFiles={mediaFiles}
              selectedMediaIds={selectedMediaIds}
              onToggleSelection={toggleMediaSelection}
            />
          </View>
        )}
      </View>
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
  headerAction: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3b82f6',
  },
  headerActionDisabled: {
    color: '#9ca3af',
  },
  content: {
    flex: 1,
  },
  form: {
    padding: 16,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1f2937',
    backgroundColor: '#fff',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#1e40af',
    lineHeight: 20,
  },
  selectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  selectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  selectionSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
});

export default CreatePlaylistModal;