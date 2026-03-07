import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useMediaUpload, IncomingUploadAsset } from '@/hooks/useMediaUpload';
import { MediaFile } from '@/shared/media-schema';
import { MaterialIconWithFallback } from '@/components/MaterialIconWithFallback';
import { useShareIntentContext } from '@/services/shareIntent';
import {
  getPendingWebShare,
  clearPendingWebShare,
  setPendingShareResume,
  clearPendingShareResume,
} from '@/services/webShareTarget';

type ImportState = 'idle' | 'uploading' | 'success' | 'error';

/**
 * Handles media shared to MerchTrader from the OS share sheet.
 * Uploads files to media library, then redirects to media tab with Add to Playlist CTA.
 */
export default function HandleShareScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { hasShareIntent, shareIntent, resetShareIntent, error: shareError } = useShareIntentContext();
  const { uploadIncomingAsset } = useMediaUpload();

  const [importState, setImportState] = useState<ImportState>('idle');
  const [uploadedFiles, setUploadedFiles] = useState<MediaFile[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const processedRef = useRef(false);

  useEffect(() => {
    if (!user) {
      if (Platform.OS === 'web') {
        setPendingShareResume();
      }
      router.replace('/auth/login');
      return;
    }
    if (Platform.OS === 'web') {
      clearPendingShareResume();
    }
  }, [user, router]);

  useEffect(() => {
    if (!user || processedRef.current) return;

    const runImport = async () => {
      let assetsToUpload: IncomingUploadAsset[] = [];
      let isWebShare = false;

      if (Platform.OS === 'web') {
        const webFiles = await getPendingWebShare();
        if (webFiles.length > 0) {
          isWebShare = true;
          assetsToUpload = webFiles
            .filter(
              (f) =>
                f.type.startsWith('image/') ||
                f.type.startsWith('video/') ||
                f.type.startsWith('audio/')
            )
            .map((f) => ({
              name: f.name,
              mimeType: f.type,
              size: f.size,
              file: f,
            }));
        }
      }

      if (!isWebShare && !hasShareIntent) {
        router.replace('/');
        return;
      }
      if (!isWebShare && shareError) {
        setImportState('error');
        setImportError(shareError);
        return;
      }

      if (!isWebShare) {
        const files = shareIntent.files;
        if (!files || files.length === 0) {
          resetShareIntent();
          router.replace('/');
          return;
        }
        const uploadableFiles = files.filter(
          (f) =>
            f.mimeType?.startsWith('image/') ||
            f.mimeType?.startsWith('video/') ||
            f.mimeType?.startsWith('audio/')
        );
        if (uploadableFiles.length === 0) {
          setImportState('error');
          setImportError('No supported media (image, video, or audio) was shared.');
          resetShareIntent();
          return;
        }
        for (const file of uploadableFiles) {
          const uri =
            ('contentUri' in file && (file as any).contentUri) ||
            file.path ||
            ('filePath' in file ? (file as any).filePath : null);
          if (!uri) continue;
          const normalizedUri =
            uri.startsWith('file://') || uri.startsWith('content://') ? uri : `file://${uri}`;
          assetsToUpload.push({
            uri: normalizedUri,
            name: file.fileName || `shared-${Date.now()}`,
            mimeType: file.mimeType || undefined,
            size:
              file.size ??
              ('fileSize' in file ? parseInt((file as any).fileSize, 10) || undefined : undefined),
          });
        }
      }

      if (assetsToUpload.length === 0) {
        if (isWebShare) await clearPendingWebShare();
        else resetShareIntent();
        router.replace('/');
        return;
      }

      processedRef.current = true;
      setImportState('uploading');

      const uploaded: MediaFile[] = [];
      let lastError: string | null = null;

      for (const asset of assetsToUpload) {
        try {
          const uploadedFile = await uploadIncomingAsset(asset);
          uploaded.push(uploadedFile);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Upload failed';
          lastError = msg;
          Alert.alert('Upload Failed', msg);
        }
      }

      if (uploaded.length > 0) {
        setUploadedFiles(uploaded);
        setImportState('success');
        if (isWebShare) await clearPendingWebShare();
        else resetShareIntent();
      } else {
        setImportState('error');
        setImportError(lastError || 'Failed to upload shared media.');
      }
    };

    runImport();
  }, [
    user,
    hasShareIntent,
    shareIntent.files,
    shareError,
    uploadIncomingAsset,
    resetShareIntent,
    router,
  ]);

  const handleGoToMedia = () => {
    router.replace('/(tabs)/media');
  };

  const handleCreatePlaylist = () => {
    router.replace({
      pathname: '/(tabs)/playlists',
      params: { fromShare: '1', mediaIds: uploadedFiles.map((f) => f.id).join(',') },
    });
  };

  const handleAddToExisting = () => {
    router.replace({
      pathname: '/(tabs)/playlists',
      params: { addToPlaylist: '1', mediaIds: uploadedFiles.map((f) => f.id).join(',') },
    });
  };

  const handleDone = () => {
    resetShareIntent();
    router.replace('/(tabs)/media');
  };

  if (!user) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.text}>Redirecting to login...</Text>
      </View>
    );
  }

  if (importState === 'uploading') {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.text}>Importing to Media Library...</Text>
      </View>
    );
  }

  if (importState === 'error') {
    return (
      <View style={styles.container}>
        <MaterialIconWithFallback name="error-outline" size={64} color="#dc2626" />
        <Text style={styles.errorText}>Import Failed</Text>
        <Text style={styles.subtext}>{importError}</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={() => router.replace('/')}>
          <Text style={styles.primaryButtonText}>Go Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (importState === 'success') {
    return (
      <View style={styles.container}>
        <MaterialIconWithFallback name="check-circle" size={64} color="#22c55e" />
        <Text style={styles.successText}>Import Complete</Text>
        <Text style={styles.subtext}>
          {uploadedFiles.length} item{uploadedFiles.length !== 1 ? 's' : ''} added to your Media
          Library.
        </Text>
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.primaryButton} onPress={handleCreatePlaylist}>
            <MaterialIconWithFallback name="add" size={20} color="#fff" />
            <Text style={styles.primaryButtonText}>Create Playlist With This</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={handleAddToExisting}>
            <MaterialIconWithFallback name="playlist-add" size={20} color="#3b82f6" />
            <Text style={styles.secondaryButtonText}>Add to Existing Playlist</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tertiaryButton} onPress={handleGoToMedia}>
            <Text style={styles.tertiaryButtonText}>View Media Library</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.doneButton} onPress={handleDone}>
          <Text style={styles.doneButtonText}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#3b82f6" />
      <Text style={styles.text}>Processing...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 24,
  },
  text: {
    marginTop: 16,
    fontSize: 16,
    color: '#374151',
  },
  subtext: {
    marginTop: 8,
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  errorText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: '#dc2626',
  },
  successText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: '#22c55e',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#3b82f6',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
    marginBottom: 12,
    minWidth: 200,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3b82f6',
    marginBottom: 12,
    minWidth: 200,
  },
  secondaryButtonText: {
    color: '#3b82f6',
    fontSize: 16,
    fontWeight: '600',
  },
  tertiaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginBottom: 12,
  },
  tertiaryButtonText: {
    color: '#6b7280',
    fontSize: 14,
  },
  doneButton: {
    marginTop: 8,
    paddingVertical: 12,
  },
  doneButtonText: {
    color: '#6b7280',
    fontSize: 14,
  },
  buttonRow: {
    alignItems: 'center',
    width: '100%',
  },
});
