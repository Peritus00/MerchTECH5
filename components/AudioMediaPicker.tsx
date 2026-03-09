/**
 * AudioMediaPicker Component
 * Allows users to select audio files from their existing media collection
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  Modal,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { mediaAPI } from '@/services/api';
import { useResponsive } from '@/hooks/useResponsive';
import ResponsiveText from './ResponsiveText';
import ResponsiveContainer from './ResponsiveContainer';

interface MediaFile {
  id: number;
  title: string;
  filename: string;
  fileType: string;
  contentType: string;
  url: string;
  s3_key?: string;
  filesize?: number;
  created_at: string;
}

interface AudioMediaPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (audioFile: MediaFile) => void;
  currentAudioUrl?: string;
}

export const AudioMediaPicker: React.FC<AudioMediaPickerProps> = ({
  visible,
  onClose,
  onSelect,
  currentAudioUrl,
}) => {
  const [audioFiles, setAudioFiles] = useState<MediaFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<MediaFile | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const { padding, fonts, isSmall } = useResponsive();

  useEffect(() => {
    if (visible) {
      fetchAudioFiles();
    }
  }, [visible]);

  const fetchAudioFiles = async () => {
    setIsLoading(true);
    try {
      console.log('🎵 AUDIO_PICKER: Fetching audio files...');
      const response = await mediaAPI.getAll();
      const allFiles = response?.media || response || [];
      
      // Filter for audio files only
      const audioOnly = allFiles.filter((file: MediaFile) => 
        file.fileType === 'audio' || 
        file.contentType?.startsWith('audio/') ||
        file.filename?.match(/\.(mp3|wav|m4a|aac|ogg|flac)$/i)
      );
      
      console.log('🎵 AUDIO_PICKER: Found audio files:', audioOnly.length);
      setAudioFiles(audioOnly);
    } catch (error) {
      console.error('🎵 AUDIO_PICKER: Error fetching audio files:', error);
      Alert.alert('Error', 'Failed to load audio files');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelect = (file: MediaFile) => {
    setSelectedFile(file);
  };

  const handleConfirmSelection = () => {
    if (selectedFile) {
      console.log('🎵 AUDIO_PICKER: Selected audio file:', selectedFile);
      onSelect(selectedFile);
      onClose();
    }
  };

  const handleUploadNew = async () => {
    try {
      console.log('🎵 AUDIO_PICKER: Starting new audio upload');
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        type: 'audio/*',
        multiple: false,
      });

      if (result.canceled) {
        console.log('🎵 AUDIO_PICKER: Upload canceled');
        return;
      }

      const file = result.assets[0];
      console.log('🎵 AUDIO_PICKER: File selected for upload', {
        name: file.name,
        uri: file.uri,
        mimeType: file.mimeType,
        size: file.size
      });
      
      setIsUploading(true);

      const filename = file.name || `audio_${Date.now()}.mp3`;
      
      // Create a File object for web compatibility
      let fileToUpload: File;
      if (Platform.OS === 'web') {
        const response = await fetch(file.uri);
        const blob = await response.blob();
        fileToUpload = new File([blob], filename, { type: file.mimeType || 'audio/mpeg' });
      } else {
        // For React Native, create a File-like object
        fileToUpload = {
          uri: file.uri,
          name: filename,
          type: file.mimeType || 'audio/mpeg',
          size: file.size,
        } as any;
      }
      
      // Upload the file
      const newMediaFile = await mediaAPI.uploadFile(fileToUpload);
      console.log('🎵 AUDIO_PICKER: Media record created:', newMediaFile);

      // Add to local list and select it
      setAudioFiles(prev => [newMediaFile, ...prev]);
      const uploadStatus = newMediaFile?.uploadStatus || newMediaFile?.upload_status;
      if (uploadStatus === 'ready') {
        setSelectedFile(newMediaFile);
      }
      
      Alert.alert(
        uploadStatus === 'ready' ? 'Success' : 'Upload Pending',
        uploadStatus === 'ready'
          ? 'Audio file uploaded successfully'
          : 'Audio file uploaded and is awaiting a security scan before it can be played.'
      );
    } catch (error) {
      console.error('🎵 AUDIO_PICKER: Upload error:', error);
      Alert.alert('Error', 'Failed to upload audio file');
    } finally {
      setIsUploading(false);
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown size';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const formatDuration = (filename?: string) => {
    // This is a placeholder - in a real app you might want to get actual duration
    return 'Audio file';
  };

  const isCurrentlySelected = (file: MediaFile) => {
    return currentAudioUrl && (
      currentAudioUrl.includes(file.id.toString()) ||
      currentAudioUrl.includes(file.filename) ||
      file.url === currentAudioUrl
    );
  };

  const renderAudioItem = ({ item }: { item: MediaFile }) => {
    const isSelected = selectedFile?.id === item.id;
    const isCurrent = isCurrentlySelected(item);

    return (
      <TouchableOpacity
        style={[
          styles.audioItem,
          { padding: padding.vertical },
          isSelected && styles.selectedItem,
          isCurrent && styles.currentItem,
        ]}
        onPress={() => handleSelect(item)}
      >
        <View style={styles.audioIcon}>
          <Ionicons 
            name={isCurrent ? "musical-note" : "musical-notes-outline"} 
            size={24} 
            color={isCurrent ? "#10b981" : isSelected ? "#3b82f6" : "#6b7280"} 
          />
        </View>

        <View style={styles.audioInfo}>
          <ResponsiveText 
            variant={isSmall ? "body" : "h4"} 
            weight="600"
            numberOfLines={1}
            style={[
              styles.audioTitle,
              isSelected && { color: "#3b82f6" },
              isCurrent && { color: "#10b981" }
            ]}
          >
            {item.title || item.filename}
          </ResponsiveText>
          
          <ResponsiveText 
            variant="caption" 
            color="#6b7280"
            numberOfLines={1}
          >
            {formatDuration(item.filename)} • {formatFileSize(item.filesize)}
          </ResponsiveText>
          
          {isCurrent && (
            <ResponsiveText 
              variant="caption" 
              color="#10b981"
              weight="600"
            >
              Currently selected
            </ResponsiveText>
          )}
        </View>

        <View style={styles.selectionIndicator}>
          {isSelected && (
            <Ionicons name="checkmark-circle" size={20} color="#3b82f6" />
          )}
          {isCurrent && !isSelected && (
            <Ionicons name="checkmark-circle" size={20} color="#10b981" />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons name="musical-notes-outline" size={64} color="#d1d5db" />
      <ResponsiveText variant="h4" color="#9ca3af" style={styles.emptyTitle}>
        No Audio Files Found
      </ResponsiveText>
      <ResponsiveText variant="body" color="#6b7280" style={styles.emptyMessage}>
        Upload some audio files to your media library first, then you can select them for your slideshow.
      </ResponsiveText>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={[styles.header, { paddingVertical: padding.vertical }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#374151" />
          </TouchableOpacity>
          
          <ResponsiveText variant="h3" weight="bold" style={styles.headerTitle}>
            Select Audio
          </ResponsiveText>
          
          <View style={styles.headerActions}>
            <TouchableOpacity 
              onPress={handleUploadNew}
              style={styles.uploadButton}
              disabled={isUploading}
            >
              {isUploading ? (
                <ActivityIndicator size="small" color="#10b981" />
              ) : (
                <Ionicons name="cloud-upload-outline" size={20} color="#10b981" />
              )}
            </TouchableOpacity>
            
            <TouchableOpacity 
              onPress={handleConfirmSelection}
              style={[
                styles.confirmButton,
                !selectedFile && styles.confirmButtonDisabled
              ]}
              disabled={!selectedFile}
            >
              <ResponsiveText 
                variant="body" 
                weight="600" 
                color={selectedFile ? "#3b82f6" : "#9ca3af"}
              >
                Select
              </ResponsiveText>
            </TouchableOpacity>
          </View>
        </View>

        {/* Content */}
        <ResponsiveContainer style={styles.content} padding={false}>
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#3b82f6" />
              <ResponsiveText variant="body" color="#6b7280" style={styles.loadingText}>
                Loading audio files...
              </ResponsiveText>
            </View>
          ) : audioFiles.length === 0 ? (
            renderEmptyState()
          ) : (
            <>
              <View style={[styles.infoBar, { paddingHorizontal: padding.horizontal }]}>
                <ResponsiveText variant="caption" color="#6b7280">
                  {audioFiles.length} audio file{audioFiles.length !== 1 ? 's' : ''} available
                </ResponsiveText>
              </View>
              
              <FlatList
                data={audioFiles}
                keyExtractor={(item) => item.id.toString()}
                renderItem={renderAudioItem}
                style={styles.list}
                contentContainerStyle={{ paddingHorizontal: padding.horizontal }}
                showsVerticalScrollIndicator={false}
              />
            </>
          )}
        </ResponsiveContainer>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  closeButton: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 16,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  uploadButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#ecfdf5',
  },
  confirmButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  content: {
    flex: 1,
  },
  infoBar: {
    paddingVertical: 12,
    backgroundColor: '#f9fafb',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  list: {
    flex: 1,
  },
  audioItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    marginVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  selectedItem: {
    borderWidth: 2,
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  currentItem: {
    borderWidth: 2,
    borderColor: '#10b981',
    backgroundColor: '#ecfdf5',
  },
  audioIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  audioInfo: {
    flex: 1,
  },
  audioTitle: {
    marginBottom: 4,
  },
  selectionIndicator: {
    width: 24,
    height: 24,
    marginLeft: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    marginTop: 16,
    marginBottom: 8,
  },
  emptyMessage: {
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default AudioMediaPicker;
