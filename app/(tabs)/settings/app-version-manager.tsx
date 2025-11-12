import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/contexts/AuthContext';
import * as DocumentPicker from 'expo-document-picker';
import { Picker } from '@react-native-picker/picker';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AppVersion {
  id: number;
  version: string;
  platform: 'android' | 'ios';
  download_url: string;
  release_notes?: string;
  is_active: boolean;
  file_size?: number;
  created_at: string;
  updated_at: string;
  uploaded_by_email?: string;
  uploaded_by_username?: string;
}

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://merchtech5-production.up.railway.app/api';

export default function AppVersionManagerScreen() {
  const { user: currentUser } = useAuth();
  const router = useRouter();
  const [versions, setVersions] = useState<AppVersion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);
  
  // Upload form state
  const [version, setVersion] = useState('');
  const [platform, setPlatform] = useState<'android' | 'ios'>('android');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [selectedFile, setSelectedFile] = useState<DocumentPicker.DocumentPickerResult | null>(null);

  useEffect(() => {
    if (currentUser === null) {
      return;
    }

    if (!currentUser?.isAdmin && currentUser?.email !== 'djjetfuel@gmail.com') {
      Alert.alert('Access Denied', 'You do not have permission to access this page', [
        { text: 'OK', onPress: () => router.replace('/') }
      ]);
      return;
    }

    fetchVersions();
  }, [currentUser, router]);

  const fetchVersions = async () => {
    try {
      setIsLoading(true);
      const token = await AsyncStorage.getItem('authToken');
      const response = await fetch(`${API_URL}/admin/app/versions`, {
        headers: {
          'Authorization': `Bearer ${token || ''}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch versions');
      }

      const data = await response.json();
      setVersions(data.versions || []);
      
      // Show warning if migration is needed
      if (data.error && data.error.includes('migration')) {
        Alert.alert(
          'Database Migration Required',
          'The app_versions table needs to be created. Please run the migration script:\n\nnpm run db:migrate-app-versions\n\nOr run the SQL file: database/migrations/024_create_app_versions_table.sql',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Error fetching versions:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to load app versions';
      Alert.alert('Error', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: platform === 'android' ? 'application/vnd.android.package-archive' : 'com.apple.itunes.ipa',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setSelectedFile(result);
      }
    } catch (error) {
      console.error('Error selecting file:', error);
      Alert.alert('Error', 'Failed to select file');
    }
  };

  const handleUpload = async () => {
    if (!version || !selectedFile || selectedFile.canceled) {
      Alert.alert('Error', 'Please fill in all fields and select a file');
      return;
    }

    // Validate version format (basic check)
    if (!/^\d+\.\d+\.\d+$/.test(version)) {
      Alert.alert('Error', 'Version must be in format X.Y.Z (e.g., 1.1.0)');
      return;
    }

    try {
      setIsUploading(true);

      const formData = new FormData();
      formData.append('version', version);
      formData.append('platform', platform);
      formData.append('releaseNotes', releaseNotes);
      
      if (!selectedFile.canceled && selectedFile.assets && selectedFile.assets.length > 0) {
        const asset = selectedFile.assets[0];
        
        let fileToUpload: any;
        
        if (Platform.OS === 'web') {
          // Web platform - convert URI to File object
          console.log('📤 Uploading on web, converting file...');
          try {
            const response = await fetch(asset.uri);
            const blob = await response.blob();
            const fileName = asset.name || (platform === 'android' ? 'app.apk' : 'app.ipa');
            const mimeType = asset.mimeType || (platform === 'android' ? 'application/vnd.android.package-archive' : 'application/octet-stream');
            fileToUpload = new File([blob], fileName, { type: mimeType });
            console.log('✅ File converted for web:', fileName, fileToUpload.size, 'bytes');
          } catch (error) {
            console.error('❌ Error converting file for web:', error);
            throw new Error('Failed to prepare file for upload: ' + (error instanceof Error ? error.message : 'Unknown error'));
          }
        } else {
          // Mobile platforms (iOS/Android) - use URI directly
          fileToUpload = {
            uri: asset.uri,
            type: asset.mimeType || (platform === 'android' ? 'application/vnd.android.package-archive' : 'application/octet-stream'),
            name: asset.name || (platform === 'android' ? 'app.apk' : 'app.ipa'),
          };
          console.log('📤 Uploading on mobile:', fileToUpload.name);
        }
        
        formData.append('file', fileToUpload);
      }

      const token = await AsyncStorage.getItem('authToken');
      
      console.log('📤 Starting upload:', {
        version,
        platform,
        fileName: selectedFile.assets?.[0]?.name,
        fileSize: selectedFile.assets?.[0]?.size,
        hasToken: !!token
      });
      
      const response = await fetch(`${API_URL}/admin/app/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token || ''}`,
          // Don't set Content-Type - let fetch set it automatically with boundary
        },
        body: formData,
      });
      
      console.log('📤 Upload response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Upload failed' }));
        const errorMessage = errorData.details || errorData.error || 'Upload failed';
        throw new Error(errorMessage);
      }

      const result = await response.json();
      Alert.alert('Success', result.message || 'Version uploaded successfully');
      
      // Reset form
      setVersion('');
      setReleaseNotes('');
      setSelectedFile(null);
      setShowUploadForm(false);
      
      // Refresh versions list
      await fetchVersions();
    } catch (error) {
      console.error('❌ Error uploading version:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to upload version';
      console.error('❌ Full error details:', error);
      Alert.alert('Upload Failed', errorMessage);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (versionId: number) => {
    Alert.alert(
      'Delete Version',
      'Are you sure you want to delete this version? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const token = await AsyncStorage.getItem('authToken');
              const response = await fetch(`${API_URL}/admin/app/versions/${versionId}`, {
                method: 'DELETE',
                headers: {
                  'Authorization': `Bearer ${token || ''}`,
                },
              });

              if (!response.ok) {
                throw new Error('Delete failed');
              }

              Alert.alert('Success', 'Version deleted successfully');
              await fetchVersions();
            } catch (error) {
              console.error('Error deleting version:', error);
              Alert.alert('Error', 'Failed to delete version');
            }
          },
        },
      ]
    );
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <ThemedText style={styles.backButton}>← Back</ThemedText>
          </TouchableOpacity>
          <ThemedText type="title">App Version Manager</ThemedText>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" />
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <ThemedText style={styles.backButton}>← Back</ThemedText>
        </TouchableOpacity>
        <ThemedText type="title">App Version Manager</ThemedText>
      </View>

      <ScrollView style={styles.scrollView}>
        <TouchableOpacity
          style={styles.uploadButton}
          onPress={() => setShowUploadForm(!showUploadForm)}
        >
          <MaterialIcons name={showUploadForm ? "close" : "add"} size={24} color="#fff" />
          <ThemedText style={styles.uploadButtonText}>
            {showUploadForm ? 'Cancel Upload' : 'Upload New Version'}
          </ThemedText>
        </TouchableOpacity>

        {showUploadForm && (
          <ThemedView style={styles.uploadForm}>
            <ThemedText type="subtitle" style={styles.formTitle}>Upload New Version</ThemedText>
            
            <View style={styles.formGroup}>
              <ThemedText style={styles.label}>Version Number</ThemedText>
              <TextInput
                style={styles.input}
                value={version}
                onChangeText={setVersion}
                placeholder="1.1.0"
                placeholderTextColor="#999"
              />
            </View>

            <View style={styles.formGroup}>
              <ThemedText style={styles.label}>Platform</ThemedText>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={platform}
                  onValueChange={(value) => setPlatform(value)}
                  style={styles.picker}
                >
                  <Picker.Item label="Android" value="android" />
                  <Picker.Item label="iOS" value="ios" />
                </Picker>
              </View>
            </View>

            <View style={styles.formGroup}>
              <ThemedText style={styles.label}>Release Notes</ThemedText>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={releaseNotes}
                onChangeText={setReleaseNotes}
                placeholder="What's new in this version..."
                placeholderTextColor="#999"
                multiline
                numberOfLines={4}
              />
            </View>

            <View style={styles.formGroup}>
              <ThemedText style={styles.label}>App File</ThemedText>
              <TouchableOpacity style={styles.fileButton} onPress={handleSelectFile}>
                <MaterialIcons name="attach-file" size={20} color="#3b82f6" />
                <ThemedText style={styles.fileButtonText}>
                  {selectedFile && !selectedFile.canceled && selectedFile.assets
                    ? selectedFile.assets[0].name
                    : `Select ${platform === 'android' ? 'APK' : 'IPA'} file`}
                </ThemedText>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.submitButton, isUploading && styles.submitButtonDisabled]}
              onPress={handleUpload}
              disabled={isUploading}
            >
              {isUploading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <MaterialIcons name="cloud-upload" size={20} color="#fff" />
                  <ThemedText style={styles.submitButtonText}>Upload Version</ThemedText>
                </>
              )}
            </TouchableOpacity>
          </ThemedView>
        )}

        <View style={styles.versionsList}>
          <ThemedText type="subtitle" style={styles.sectionTitle}>
            Existing Versions ({versions.length})
          </ThemedText>

          {versions.length === 0 ? (
            <ThemedView style={styles.emptyState}>
              <MaterialIcons name="info" size={48} color="#94a3b8" />
              <ThemedText style={styles.emptyStateText}>No versions uploaded yet</ThemedText>
            </ThemedView>
          ) : (
            versions.map((v) => (
              <ThemedView key={v.id} style={[styles.versionCard, v.is_active && styles.activeVersionCard]}>
                <View style={styles.versionHeader}>
                  <View style={styles.versionInfo}>
                    <ThemedText style={styles.versionNumber}>{v.version}</ThemedText>
                    <View style={styles.versionBadges}>
                      <View style={[styles.platformBadge, v.platform === 'android' && styles.androidBadge]}>
                        <ThemedText style={styles.platformBadgeText}>
                          {v.platform.toUpperCase()}
                        </ThemedText>
                      </View>
                      {v.is_active && (
                        <View style={styles.activeBadge}>
                          <ThemedText style={styles.activeBadgeText}>ACTIVE</ThemedText>
                        </View>
                      )}
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDelete(v.id)}
                  >
                    <MaterialIcons name="delete" size={20} color="#ef4444" />
                  </TouchableOpacity>
                </View>

                {v.release_notes && (
                  <ThemedText style={styles.releaseNotes}>{v.release_notes}</ThemedText>
                )}

                <View style={styles.versionMeta}>
                  <ThemedText style={styles.metaText}>
                    Size: {formatFileSize(v.file_size)}
                  </ThemedText>
                  <ThemedText style={styles.metaText}>
                    Uploaded: {formatDate(v.created_at)}
                  </ThemedText>
                  {v.uploaded_by_email && (
                    <ThemedText style={styles.metaText}>
                      By: {v.uploaded_by_username || v.uploaded_by_email}
                    </ThemedText>
                  )}
                </View>
              </ThemedView>
            ))
          )}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  backButton: {
    fontSize: 16,
    color: '#3b82f6',
    marginRight: 16,
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  uploadButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  uploadForm: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  formTitle: {
    marginBottom: 16,
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: '#1e293b',
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#1e293b',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  pickerContainer: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    overflow: 'hidden',
  },
  picker: {
    color: '#1e293b',
  },
  fileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 12,
  },
  fileButtonText: {
    marginLeft: 8,
    color: '#3b82f6',
    fontSize: 16,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
    padding: 14,
    borderRadius: 8,
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  versionsList: {
    marginTop: 8,
  },
  sectionTitle: {
    marginBottom: 16,
  },
  emptyState: {
    alignItems: 'center',
    padding: 32,
  },
  emptyStateText: {
    marginTop: 16,
    color: '#94a3b8',
    fontSize: 16,
  },
  versionCard: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  activeVersionCard: {
    borderColor: '#10b981',
    borderWidth: 2,
  },
  versionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  versionInfo: {
    flex: 1,
  },
  versionNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 8,
  },
  versionBadges: {
    flexDirection: 'row',
    gap: 8,
  },
  platformBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  androidBadge: {
    backgroundColor: '#dcfce7',
  },
  platformBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  activeBadge: {
    backgroundColor: '#10b981',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  activeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  releaseNotes: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 12,
    lineHeight: 20,
  },
  versionMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  metaText: {
    fontSize: 12,
    color: '#94a3b8',
  },
  deleteButton: {
    padding: 8,
  },
});

