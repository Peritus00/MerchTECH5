
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
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Playlist, ActivationCode } from '@/shared/media-schema';
import ActivationCodeCard from '@/components/ActivationCodeCard';
import CreateCodeModal from '@/components/CreateCodeModal';
import AccessControlCard from '@/components/AccessControlCard';

export default function PlaylistAccessSettingsScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { id } = route.params as { id: string };
  
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [activationCodes, setActivationCodes] = useState<ActivationCode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [updatingAccess, setUpdatingAccess] = useState(false);

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    try {
      // Mock data - replace with actual API calls
      const mockPlaylist: Playlist = {
        id: id,
        name: 'My Favorite Tracks',
        requiresActivationCode: false,
        isPublic: false,
        createdAt: new Date().toISOString(),
        mediaFiles: [
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
        ],
      };

      const mockActivationCodes: ActivationCode[] = [
        {
          id: 1,
          code: 'ABC123',
          playlistId: id,
          maxUses: 5,
          usesCount: 2,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          isActive: true,
          createdAt: new Date().toISOString(),
        },
        {
          id: 2,
          code: 'XYZ789',
          playlistId: id,
          maxUses: null,
          usesCount: 10,
          expiresAt: null,
          isActive: false,
          createdAt: new Date().toISOString(),
        },
      ];
      
      setPlaylist(mockPlaylist);
      setActivationCodes(mockActivationCodes);
    } catch (error) {
      console.error('Error fetching data:', error);
      Alert.alert('Error', 'Failed to load playlist data');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const handleToggleAccessControl = async (requiresCode: boolean) => {
    if (!playlist) return;

    Alert.alert(
      requiresCode ? 'Enable Access Control' : 'Disable Access Control',
      requiresCode 
        ? 'This will require users to enter an activation code to access this playlist.'
        : 'This will make the playlist publicly accessible without any code.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setUpdatingAccess(true);
            try {
              // Mock API call
              const updatedPlaylist = { ...playlist, requiresActivationCode: requiresCode };
              setPlaylist(updatedPlaylist);
              Alert.alert(
                'Success',
                requiresCode 
                  ? 'Access control enabled. Users will now need activation codes.'
                  : 'Access control disabled. Playlist is now public.'
              );
            } catch (error) {
              console.error('Error updating access control:', error);
              Alert.alert('Error', 'Failed to update access settings');
            } finally {
              setUpdatingAccess(false);
            }
          },
        },
      ]
    );
  };

  const handleCreateCode = async (codeData: {
    maxUses?: number | null;
    expiresAt?: Date | null;
  }) => {
    try {
      const newCode: ActivationCode = {
        id: Date.now(),
        code: Math.random().toString(36).substring(2, 8).toUpperCase(),
        playlistId: id,
        maxUses: codeData.maxUses || null,
        usesCount: 0,
        expiresAt: codeData.expiresAt?.toISOString() || null,
        isActive: true,
        createdAt: new Date().toISOString(),
      };

      setActivationCodes(prev => [newCode, ...prev]);
      setShowCreateModal(false);
      Alert.alert('Success', 'Activation code created successfully');
    } catch (error) {
      console.error('Error creating activation code:', error);
      Alert.alert('Error', 'Failed to create activation code');
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
          onPress: () => {
            setActivationCodes(prev => prev.filter(code => code.id !== codeId));
            Alert.alert('Success', 'Activation code deleted');
          },
        },
      ]
    );
  };

  const handleToggleCodeStatus = async (codeId: number, isActive: boolean) => {
    try {
      setActivationCodes(prev => 
        prev.map(code => code.id === codeId ? { ...code, isActive } : code)
      );
    } catch (error) {
      console.error('Error updating activation code:', error);
      Alert.alert('Error', 'Failed to update activation code');
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  if (isLoading || !playlist) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <ThemedText style={styles.loadingText}>Loading playlist settings...</ThemedText>
      </ThemedView>
    );
  }

  const activeCodes = activationCodes.filter(code => code.isActive);
  const inactiveCodes = activationCodes.filter(code => !code.isActive);

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#1f2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Access Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Playlist Info */}
        <View style={styles.playlistInfo}>
          <Text style={styles.playlistName} numberOfLines={2}>
            {playlist.name}
          </Text>
          <Text style={styles.playlistSubtitle}>
            {playlist.mediaFiles?.length || 0} media files
          </Text>
        </View>

        {/* Access Control Settings */}
        <AccessControlCard
          playlist={playlist}
          onToggle={handleToggleAccessControl}
          isUpdating={updatingAccess}
        />

        {/* Generate Code Button */}
        {playlist.requiresActivationCode && (
          <TouchableOpacity
            style={styles.generateButton}
            onPress={() => setShowCreateModal(true)}
          >
            <MaterialIcons name="add" size={24} color="#fff" />
            <Text style={styles.generateButtonText}>Generate New Code</Text>
          </TouchableOpacity>
        )}

        {/* Activation Codes List */}
        {playlist.requiresActivationCode && (
          <View style={styles.codesSection}>
            {/* Active Codes */}
            {activeCodes.length > 0 && (
              <View style={styles.codeGroup}>
                <Text style={styles.groupTitle}>
                  Active Codes ({activeCodes.length})
                </Text>
                {activeCodes.map((code) => (
                  <ActivationCodeCard
                    key={code.id}
                    code={code}
                    onDelete={() => handleDeleteCode(code.id)}
                    onToggleStatus={(isActive) => handleToggleCodeStatus(code.id, isActive)}
                  />
                ))}
              </View>
            )}

            {/* Inactive Codes */}
            {inactiveCodes.length > 0 && (
              <View style={styles.codeGroup}>
                <Text style={styles.groupTitle}>
                  Inactive Codes ({inactiveCodes.length})
                </Text>
                {inactiveCodes.map((code) => (
                  <ActivationCodeCard
                    key={code.id}
                    code={code}
                    onDelete={() => handleDeleteCode(code.id)}
                    onToggleStatus={(isActive) => handleToggleCodeStatus(code.id, isActive)}
                  />
                ))}
              </View>
            )}

            {/* Empty State */}
            {activationCodes.length === 0 && (
              <View style={styles.emptyContainer}>
                <MaterialIcons name="vpn-key" size={48} color="#9ca3af" />
                <Text style={styles.emptyText}>No activation codes yet</Text>
                <Text style={styles.emptySubtext}>
                  Generate your first activation code to control access to this playlist
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Create Code Modal */}
      <CreateCodeModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreateCode={handleCreateCode}
        playlistName={playlist.name}
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  playlistInfo: {
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
  playlistName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4,
  },
  playlistSubtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 24,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  generateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  codesSection: {
    gap: 16,
  },
  codeGroup: {
    marginBottom: 24,
  },
  groupTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6b7280',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Playlist } from '@/shared/media-schema';
import PreviewPlayer from '@/components/PreviewPlayer';

export default function PlaylistAccessScreen() {
  const route = useRoute();
  const { id } = route.params as { id: string };
  
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [activationCode, setActivationCode] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isValidating, setIsValidating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewCompleted, setPreviewCompleted] = useState(false);

  useEffect(() => {
    fetchPlaylist();
  }, [id]);

  const fetchPlaylist = async () => {
    try {
      // Mock data - replace with actual API call
      const mockPlaylist: Playlist = {
        id: id,
        name: 'Hip Hop Hits Premium',
        requiresActivationCode: true,
        isPublic: true,
        createdAt: new Date().toISOString(),
        mediaFiles: [
          {
            id: 1,
            uniqueId: 'audio-1',
            title: 'Track 1.mp3',
            fileType: 'audio',
            filePath: '/path/to/audio1.mp3',
            contentType: 'audio/mpeg',
            createdAt: new Date().toISOString(),
          },
          {
            id: 2,
            uniqueId: 'audio-2',
            title: 'Track 2.mp3',
            fileType: 'audio',
            filePath: '/path/to/audio2.mp3',
            contentType: 'audio/mpeg',
            createdAt: new Date().toISOString(),
          },
        ],
      };
      
      setPlaylist(mockPlaylist);
    } catch (error) {
      console.error('Error fetching playlist:', error);
      Alert.alert('Error', 'Failed to load playlist');
    } finally {
      setIsLoading(false);
    }
  };

  const handleActivationCodeSubmit = async () => {
    if (!activationCode.trim()) {
      Alert.alert('Error', 'Please enter an activation code');
      return;
    }

    setIsValidating(true);
    try {
      // Mock validation - replace with actual API call
      const isValid = activationCode === 'DEMO123'; // Mock valid code
      
      if (isValid) {
        // Redirect to full media player
        router.replace(`/media-player/${id}`);
      } else {
        Alert.alert('Invalid Code', 'The activation code you entered is not valid.');
        setActivationCode('');
      }
    } catch (error) {
      console.error('Error validating code:', error);
      Alert.alert('Error', 'Failed to validate activation code');
    } finally {
      setIsValidating(false);
    }
  };

  const handlePreviewStart = () => {
    setShowPreview(true);
  };

  const handlePreviewComplete = () => {
    setPreviewCompleted(true);
    setShowPreview(false);
    // Redirect to store after preview
    setTimeout(() => {
      router.push('/store');
    }, 2000);
  };

  const handleGoToStore = () => {
    router.push('/store');
  };

  if (isLoading || !playlist) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <ThemedText style={styles.loadingText}>Loading playlist...</ThemedText>
      </ThemedView>
    );
  }

  if (showPreview) {
    return (
      <ThemedView style={styles.container}>
        <PreviewPlayer
          mediaFiles={playlist.mediaFiles.map(file => ({
            id: file.id,
            title: file.title,
            url: file.filePath,
            fileType: file.fileType,
            contentType: file.contentType,
          }))}
          playlistName={playlist.name}
          previewDuration={30}
          autoplay={true}
        />
        <View style={styles.previewActions}>
          <TouchableOpacity
            style={styles.storeButton}
            onPress={handleGoToStore}
          >
            <MaterialIcons name="storefront" size={20} color="#fff" />
            <Text style={styles.storeButtonText}>Visit Store</Text>
          </TouchableOpacity>
        </View>
      </ThemedView>
    );
  }

  if (previewCompleted) {
    return (
      <ThemedView style={styles.redirectContainer}>
        <MaterialIcons name="storefront" size={64} color="#3b82f6" />
        <Text style={styles.redirectTitle}>Preview Complete!</Text>
        <Text style={styles.redirectText}>
          Redirecting you to our store to explore more content...
        </Text>
        <ActivityIndicator size="large" color="#3b82f6" style={styles.redirectSpinner} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color="#1f2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Access Required</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        {/* Playlist Info */}
        <View style={styles.playlistInfo}>
          <MaterialIcons name="queue-music" size={48} color="#3b82f6" />
          <Text style={styles.playlistName}>{playlist.name}</Text>
          <Text style={styles.playlistSubtitle}>
            {playlist.mediaFiles.length} tracks • Premium Content
          </Text>
        </View>

        {/* Access Options */}
        <View style={styles.accessOptions}>
          <Text style={styles.sectionTitle}>Choose an option to continue:</Text>

          {/* Activation Code Option */}
          <View style={styles.optionCard}>
            <View style={styles.optionHeader}>
              <MaterialIcons name="vpn-key" size={24} color="#10b981" />
              <Text style={styles.optionTitle}>Enter Activation Code</Text>
            </View>
            <Text style={styles.optionDescription}>
              Have an activation code? Enter it below for full access to this playlist.
            </Text>
            
            <View style={styles.codeInputContainer}>
              <TextInput
                style={styles.codeInput}
                value={activationCode}
                onChangeText={setActivationCode}
                placeholder="Enter activation code"
                placeholderTextColor="#9ca3af"
                autoCapitalize="characters"
                maxLength={20}
              />
              <TouchableOpacity
                style={[styles.submitButton, (!activationCode.trim() || isValidating) && styles.disabledButton]}
                onPress={handleActivationCodeSubmit}
                disabled={!activationCode.trim() || isValidating}
              >
                {isValidating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <MaterialIcons name="check" size={20} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Preview Option */}
          <View style={styles.optionCard}>
            <View style={styles.optionHeader}>
              <MaterialIcons name="preview" size={24} color="#f59e0b" />
              <Text style={styles.optionTitle}>30-Second Preview</Text>
            </View>
            <Text style={styles.optionDescription}>
              Get a taste of this playlist with a 30-second preview of each track.
            </Text>
            
            <TouchableOpacity
              style={styles.previewButton}
              onPress={handlePreviewStart}
            >
              <MaterialIcons name="play-circle" size={20} color="#f59e0b" />
              <Text style={styles.previewButtonText}>Start Preview</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Store Promotion */}
        <View style={styles.storePromo}>
          <MaterialIcons name="storefront" size={32} color="#6b7280" />
          <Text style={styles.storePromoTitle}>Want full access?</Text>
          <Text style={styles.storePromoText}>
            Check out our store for activation codes and exclusive content!
          </Text>
          <TouchableOpacity
            style={styles.storePromoButton}
            onPress={handleGoToStore}
          >
            <Text style={styles.storePromoButtonText}>Visit Store</Text>
          </TouchableOpacity>
        </View>
      </View>
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
  redirectContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  redirectTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 16,
    marginBottom: 8,
  },
  redirectText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  redirectSpinner: {
    marginTop: 16,
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
  content: {
    flex: 1,
    padding: 16,
  },
  playlistInfo: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  playlistName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 12,
    textAlign: 'center',
  },
  playlistSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  accessOptions: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 16,
  },
  optionCard: {
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
  optionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginLeft: 8,
  },
  optionDescription: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
    marginBottom: 16,
  },
  codeInputContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  codeInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1f2937',
    backgroundColor: '#f9fafb',
  },
  submitButton: {
    backgroundColor: '#10b981',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.5,
  },
  previewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: 'center',
    gap: 8,
  },
  previewButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#92400e',
  },
  previewActions: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  storeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    justifyContent: 'center',
    gap: 8,
  },
  storeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  storePromo: {
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 20,
  },
  storePromoTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginTop: 8,
    marginBottom: 4,
  },
  storePromoText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 16,
  },
  storePromoButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  storePromoButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});
