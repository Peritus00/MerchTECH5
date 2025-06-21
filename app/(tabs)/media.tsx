
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { MediaFile } from '@/shared/media-schema';
import { useMediaUpload } from '@/hooks/useMediaUpload';
import MediaFileCard from '@/components/MediaFileCard';
import UploadProgressModal from '@/components/UploadProgressModal';

export default function MediaScreen() {
  const { uploadProgress, isUploading, selectAndUploadFile } = useMediaUpload();
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'all' | 'audio' | 'video'>('all');

  useEffect(() => {
    fetchMediaFiles();
  }, []);

  const fetchMediaFiles = async () => {
    try {
      // Mock data - replace with actual API call
      const mockFiles: MediaFile[] = [
        {
          id: 1,
          uniqueId: 'audio-1',
          title: 'Sample Audio Track.mp3',
          fileType: 'audio',
          filePath: '/path/to/audio.mp3',
          contentType: 'audio/mpeg',
          filesize: 5242880,
          createdAt: new Date().toISOString(),
        },
        {
          id: 2,
          uniqueId: 'video-1',
          title: 'Sample Video.mp4',
          fileType: 'video',
          filePath: '/path/to/video.mp4',
          contentType: 'video/mp4',
          filesize: 15728640,
          createdAt: new Date().toISOString(),
        },
      ];
      
      setMediaFiles(mockFiles);
    } catch (error) {
      console.error('Error fetching media files:', error);
      Alert.alert('Error', 'Failed to load media files');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const handleUpload = async () => {
    try {
      const uploadedFile = await selectAndUploadFile();
      if (uploadedFile) {
        setMediaFiles(prev => [uploadedFile, ...prev]);
        Alert.alert('Success', 'File uploaded successfully');
      }
    } catch (error) {
      console.error('Upload error:', error);
      Alert.alert('Upload Failed', 'Please try again');
    }
  };

  const handleDelete = async (id: number) => {
    Alert.alert(
      'Delete File',
      'Are you sure you want to delete this file?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setMediaFiles(prev => prev.filter(file => file.id !== id));
          },
        },
      ]
    );
  };

  const handlePlay = (file: MediaFile) => {
    Alert.alert('Play File', `Playing: ${file.title}`);
    // Navigate to media player screen
  };

  const filteredFiles = mediaFiles.filter(file => {
    if (selectedTab === 'all') return true;
    if (selectedTab === 'audio') return file.fileType === 'audio' || file.contentType?.startsWith('audio/');
    if (selectedTab === 'video') return file.fileType === 'video' || file.contentType?.startsWith('video/');
    return true;
  });

  const onRefresh = () => {
    setRefreshing(true);
    fetchMediaFiles();
  };

  if (isLoading) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <ThemedText style={styles.loadingText}>Loading media files...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <ThemedText type="title">Media Library</ThemedText>
        <TouchableOpacity onPress={handleUpload} disabled={isUploading} style={styles.uploadButton}>
          <MaterialIcons name="cloud-upload" size={20} color="#fff" />
          <Text style={styles.uploadButtonText}>Upload</Text>
        </TouchableOpacity>
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        {['all', 'audio', 'video'].map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[
              styles.tab,
              selectedTab === tab && styles.activeTab,
            ]}
            onPress={() => setSelectedTab(tab as any)}
          >
            <Text
              style={[
                styles.tabText,
                selectedTab === tab && styles.activeTabText,
              ]}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Media Files List */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {filteredFiles.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialIcons name="library-music" size={64} color="#9ca3af" />
            <ThemedText style={styles.emptyText}>No media files found</ThemedText>
            <ThemedText style={styles.emptySubtext}>
              Upload your first {selectedTab === 'all' ? 'media' : selectedTab} file to get started
            </ThemedText>
            <TouchableOpacity style={styles.createButton} onPress={handleUpload}>
              <MaterialIcons name="cloud-upload" size={20} color="#fff" />
              <Text style={styles.createButtonText}>Upload File</Text>
            </TouchableOpacity>
          </View>
        ) : (
          filteredFiles.map((file) => (
            <MediaFileCard
              key={file.id}
              file={file}
              onDelete={() => handleDelete(file.id)}
              onPlay={() => handlePlay(file)}
            />
          ))
        )}
      </ScrollView>

      {/* Upload Progress Modal */}
      <UploadProgressModal
        visible={isUploading}
        progress={uploadProgress}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  uploadButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    margin: 20,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 6,
  },
  activeTab: {
    backgroundColor: '#3b82f6',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
  },
  activeTabText: {
    color: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 0,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6b7280',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 32,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginTop: 24,
    gap: 8,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
