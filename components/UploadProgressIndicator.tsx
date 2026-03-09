import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useUpload } from '@/contexts/UploadContext';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import * as Progress from 'react-native-progress';

export const UploadProgressIndicator: React.FC = () => {
  const { isUploading, uploadProgress } = useUpload();

  if (!isUploading) {
    return null;
  }

  const getStageMessage = () => {
    switch (uploadProgress.stage) {
      case 'selecting':
        return 'Selecting file...';
      case 'reading':
        return 'Preparing file for upload...';
      case 'uploading':
        return `Uploading... ${uploadProgress.percentage}%`;
      case 'verifying':
        return 'Upload complete. Verifying file...';
      case 'pending_scan':
        return 'Uploaded. Awaiting security scan...';
      case 'creating':
        return 'Saving media details...';
      case 'complete':
        return 'Upload complete!';
      default:
        return '';
    }
  };

  return (
    <View style={styles.overlay}>
      <ThemedView style={styles.container}>
        <ThemedText style={styles.title}>Uploading Media</ThemedText>
        <View style={styles.progressContainer}>
          <Progress.Bar 
            progress={uploadProgress.percentage / 100} 
            width={200} 
            color="#3b82f6"
          />
        </View>
        <ThemedText style={styles.stageText}>{getStageMessage()}</ThemedText>
      </ThemedView>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    zIndex: 1000,
    elevation: 10,
  },
  container: {
    padding: 15,
    borderRadius: 10,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 5,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  progressContainer: {
    alignItems: 'center',
    marginBottom: 10,
  },
  stageText: {
    textAlign: 'center',
    fontSize: 14,
    color: '#6b7280',
  },
}); 