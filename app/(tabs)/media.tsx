
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
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import HeaderWithLogo from '@/components/HeaderWithLogo';
import { MediaFile } from '@/shared/media-schema';
import { useMediaUpload } from '@/hooks/useMediaUpload';
import { mediaAPI } from '@/services/api';
import MediaFileCard from '@/components/MediaFileCard';
import UploadProgressModal from '@/components/UploadProgressModal';

export default function MediaScreen() {
  const router = useRouter();
  const { uploadProgress, isUploading, selectAndUploadFile } = useMediaUpload();
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'all' | 'audio' | 'video'>('all');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<{ id: number; name: string } | null>(null);

  useEffect(() => {
    fetchMediaFiles();
  }, []);

  const fetchMediaFiles = async () => {
    try {
      console.log('🔴 MEDIA: Fetching media files from database...');
      const files = await mediaAPI.getAll();
      console.log('🔴 MEDIA: Loaded media files:', files.length);
      setMediaFiles(files);
    } catch (error) {
      console.error('🔴 MEDIA: Error fetching media files:', error);
      Alert.alert('Error', 'Failed to load media files');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const handleUpload = async () => {
    try {
      console.log('🔴 MEDIA: Starting file upload...');
      const uploadedFile = await selectAndUploadFile();
      if (uploadedFile) {
        console.log('🔴 MEDIA: File uploaded successfully:', uploadedFile);
        setMediaFiles(prev => [uploadedFile, ...prev]);
        Alert.alert('Success', 'File uploaded successfully');
        // Refresh the media list to ensure consistency
        await fetchMediaFiles();
      }
    } catch (error) {
      console.error('🔴 MEDIA: Upload error:', error);
      Alert.alert('Upload Failed', 'Please try again');
    }
  };

  const handleDelete = async (id: number) => {
    console.log('🔴 MEDIA: handleDelete called with ID:', id);
    console.log('🔴 MEDIA: Current media files count:', mediaFiles.length);
    
    const fileToDeleteItem = mediaFiles.find(file => file.id === id);
    const fileName = fileToDeleteItem?.title || 'this file';
    
    console.log('🔴 MEDIA: File to delete:', {
      id,
      fileName,
      fileExists: !!fileToDeleteItem,
      timestamp: new Date().toISOString()
    });

    // Set the file to delete and show dialog
    setFileToDelete({ id, name: fileName });
    setShowDeleteDialog(true);
    console.log('🔴 MEDIA: Showing delete confirmation dialog for:', fileName);
  };

  const confirmDelete = async () => {
    if (!fileToDelete) return;
    
    console.log('🔴 MEDIA: User confirmed delete for file:', fileToDelete);
    setShowDeleteDialog(false);

    try {
      console.log('🔴 MEDIA: Starting delete for file:', fileToDelete);
      
      // Call the delete API
      const response = await mediaAPI.delete(fileToDelete.id);
      console.log('🔴 MEDIA: Delete API response:', response);
      
      // Remove from local state immediately for better UX
      setMediaFiles(prev => {
        const newFiles = prev.filter(file => file.id !== fileToDelete.id);
        console.log('🔴 MEDIA: Updated media files list, removed file:', fileToDelete.id);
        console.log('🔴 MEDIA: Remaining files count:', newFiles.length);
        return newFiles;
      });
      
      Alert.alert('Success', `"${fileToDelete.name}" has been deleted successfully`);
      
      // Optionally refresh the media list to ensure consistency
      setTimeout(() => {
        fetchMediaFiles();
      }, 1000);
      
    } catch (error: any) {
      console.error('🔴 MEDIA: Delete error:', error);
      
      let errorMessage = 'Failed to delete file';
      if (error.response?.status === 404) {
        errorMessage = 'File not found or already deleted';
      } else if (error.response?.status === 403) {
        errorMessage = 'You do not have permission to delete this file';
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      Alert.alert('Delete Failed', errorMessage);
    } finally {
      setFileToDelete(null);
    }
  };

  const cancelDelete = () => {
    console.log('🔴 MEDIA: User cancelled delete operation');
    setShowDeleteDialog(false);
    setFileToDelete(null);
  };

  const handlePlay = (file: MediaFile) => {
    // Navigate to media player screen with the file
    router.push(`/media-player/${file.id}`);
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
      <HeaderWithLogo
        title="Media Library"
        onRightButtonPress={handleUpload}
        rightButtonIcon="cloud-upload"
        rightButtonColor="#3b82f6"
        logoVariant="gold"
      />

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

      {/* Delete Confirmation Dialog */}
      <Modal
        visible={showDeleteDialog}
        transparent={true}
        animationType="fade"
        onRequestClose={cancelDelete}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.dialogContainer}>
            <View style={styles.dialogHeader}>
              <MaterialIcons name="delete-forever" size={32} color="#ef4444" />
              <Text style={styles.dialogTitle}>Delete File</Text>
            </View>
            
            <Text style={styles.dialogMessage}>
              Are you sure you want to delete "{fileToDelete?.name}"?{'\n'}
              This action cannot be undone.
            </Text>
            
            <View style={styles.dialogButtons}>
              <TouchableOpacity
                style={[styles.dialogButton, styles.cancelButton]}
                onPress={cancelDelete}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.dialogButton, styles.deleteButton]}
                onPress={confirmDelete}
              >
                <Text style={styles.deleteButtonText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dialogContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  dialogHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  dialogTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
    marginTop: 8,
  },
  dialogMessage: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  dialogButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  dialogButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  deleteButton: {
    backgroundColor: '#ef4444',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
