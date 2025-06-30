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
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function PlaylistAccessScreen() {
  const route = useRoute();
  const { id } = route.params as { id: string };

  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [activationCode, setActivationCode] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isValidating, setIsValidating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewCompleted, setPreviewCompleted] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [isBlocked, setIsBlocked] = useState(false);

  useEffect(() => {
    fetchPlaylist();
  }, [id]);

  const fetchPlaylist = async () => {
    try {
      console.log('🔴 PLAYLIST_ACCESS: Fetching playlist with ID:', id);

      const { playlistAPI } = await import('@/services/api');
      const playlistData = await playlistAPI.getById(id);

      console.log('🔴 PLAYLIST_ACCESS: Loaded playlist:', playlistData);

      // Ensure mediaFiles have full URLs
      if (playlistData.mediaFiles) {
        playlistData.mediaFiles = playlistData.mediaFiles.map((file: any) => ({
          ...file,
          filePath: file.filePath.startsWith('http') 
            ? file.filePath 
            : `https://4311622a-238a-4013-b1eb-c601507a6400-00-3l5qvyow6auc.kirk.replit.dev:5001${file.filePath}`,
        }));
      }

      setPlaylist(playlistData);
    } catch (error: any) {
      console.error('🔴 PLAYLIST_ACCESS: Error fetching playlist:', error);
      const errorMessage = error.response?.data?.error || error.message || 'Failed to load playlist';
      Alert.alert('Error', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleActivationCodeSubmit = async () => {
    if (!activationCode.trim()) {
      Alert.alert('Error', 'Please enter an activation code');
      return;
    }

    if (isBlocked) {
      Alert.alert('Access Blocked', 'Too many failed attempts. Please visit our store to purchase access.');
      return;
    }

    setIsValidating(true);
    try {
      console.log('🔴 PLAYLIST_ACCESS: Validating activation code:', activationCode);
      
      // TODO: Replace with actual API call to validate activation code
      // For now, using mock validation
      const isValid = activationCode === 'DEMO123' || activationCode === 'VALID123';

      if (isValid) {
        console.log('🔴 PLAYLIST_ACCESS: Valid activation code, redirecting to media player');
        // SCENARIO 2: Valid activation code - redirect to full media player
        router.replace(`/media-player/${id}`);
      } else {
        console.log('🔴 PLAYLIST_ACCESS: Invalid activation code, attempt:', failedAttempts + 1);
        
        const newFailedAttempts = failedAttempts + 1;
        setFailedAttempts(newFailedAttempts);
        
        if (newFailedAttempts >= 3) {
          console.log('🔴 PLAYLIST_ACCESS: 3 failed attempts reached, blocking and redirecting to store');
          setIsBlocked(true);
          Alert.alert(
            'Access Blocked', 
            'You have entered an invalid activation code 3 times. You will be redirected to our store to purchase access.',
            [
              {
                text: 'Go to Store',
                onPress: () => {
                  router.replace('/store');
                }
              }
            ]
          );
        } else {
          const remainingAttempts = 3 - newFailedAttempts;
          Alert.alert(
            'Invalid Code', 
            `The activation code you entered is not valid. You have ${remainingAttempts} attempt${remainingAttempts === 1 ? '' : 's'} remaining.`
          );
        }
        
        setActivationCode('');
      }
    } catch (error) {
      console.error('🔴 PLAYLIST_ACCESS: Error validating code:', error);
      Alert.alert('Error', 'Failed to validate activation code');
    } finally {
      setIsValidating(false);
    }
  };

  const handlePreviewStart = () => {
    console.log('🔴 PLAYLIST_ACCESS: Starting 30-second preview');
    setShowPreview(true);
  };

  const handlePreviewComplete = () => {
    console.log('🔴 PLAYLIST_ACCESS: Preview completed, redirecting to store');
    setPreviewCompleted(true);
    setShowPreview(false);
    
    // SCENARIO 3: Preview completed - redirect to store after 2 seconds
    setTimeout(() => {
      router.replace('/store');
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
          onPreviewComplete={handlePreviewComplete}
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
                style={[styles.codeInput, isBlocked && styles.blockedInput]}
                value={activationCode}
                onChangeText={setActivationCode}
                placeholder={isBlocked ? "Access blocked" : "Enter activation code"}
                placeholderTextColor={isBlocked ? "#ef4444" : "#9ca3af"}
                autoCapitalize="characters"
                maxLength={20}
                editable={!isBlocked}
              />
              <TouchableOpacity
                style={[
                  styles.submitButton, 
                  (!activationCode.trim() || isValidating || isBlocked) && styles.disabledButton
                ]}
                onPress={handleActivationCodeSubmit}
                disabled={!activationCode.trim() || isValidating || isBlocked}
              >
                {isValidating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : isBlocked ? (
                  <MaterialIcons name="block" size={20} color="#fff" />
                ) : (
                  <MaterialIcons name="check" size={20} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
            
            {/* Failed attempts indicator */}
            {failedAttempts > 0 && !isBlocked && (
              <View style={styles.attemptsWarning}>
                <MaterialIcons name="warning" size={16} color="#f59e0b" />
                <Text style={styles.attemptsText}>
                  {failedAttempts}/3 failed attempts
                </Text>
              </View>
            )}
            
            {/* Blocked message */}
            {isBlocked && (
              <View style={styles.blockedMessage}>
                <MaterialIcons name="block" size={16} color="#ef4444" />
                <Text style={styles.blockedText}>
                  Access blocked after 3 failed attempts. Visit our store to purchase access.
                </Text>
              </View>
            )}
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
  blockedInput: {
    borderColor: '#ef4444',
    backgroundColor: '#fef2f2',
  },
  attemptsWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#fef3c7',
    borderRadius: 6,
    gap: 6,
  },
  attemptsText: {
    fontSize: 12,
    color: '#92400e',
    fontWeight: '500',
  },
  blockedMessage: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fef2f2',
    borderRadius: 6,
    gap: 6,
  },
  blockedText: {
    fontSize: 12,
    color: '#dc2626',
    fontWeight: '500',
    flex: 1,
    lineHeight: 16,
  },
});