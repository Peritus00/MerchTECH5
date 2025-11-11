import React from 'react';
import {
  View,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Linking,
  ScrollView,
} from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { MaterialIcons } from '@expo/vector-icons';

interface UpdateNotificationModalProps {
  visible: boolean;
  currentVersion: string;
  latestVersion: {
    version: string;
    downloadUrl: string;
    releaseNotes?: string;
    fileSize?: number;
  } | null;
  onDismiss: () => void;
  onDownload: () => void;
}

export function UpdateNotificationModal({
  visible,
  currentVersion,
  latestVersion,
  onDismiss,
  onDownload,
}: UpdateNotificationModalProps) {
  const handleDownload = async () => {
    if (!latestVersion?.downloadUrl) return;
    
    try {
      const canOpen = await Linking.canOpenURL(latestVersion.downloadUrl);
      if (canOpen) {
        await Linking.openURL(latestVersion.downloadUrl);
        onDownload();
      } else {
        // Fallback: try to copy URL or show error
        console.error('Cannot open download URL:', latestVersion.downloadUrl);
      }
    } catch (error) {
      console.error('Error opening download URL:', error);
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  if (!latestVersion) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <ThemedView style={styles.modalContainer}>
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <MaterialIcons name="system-update" size={32} color="#3b82f6" />
            </View>
            <ThemedText type="subtitle" style={styles.title}>
              Update Available
            </ThemedText>
          </View>

          <View style={styles.content}>
            <ThemedText style={styles.versionInfo}>
              Current Version: <ThemedText style={styles.versionNumber}>{currentVersion}</ThemedText>
            </ThemedText>
            <ThemedText style={styles.versionInfo}>
              Latest Version: <ThemedText style={styles.latestVersionNumber}>{latestVersion.version}</ThemedText>
            </ThemedText>

            {latestVersion.fileSize && (
              <ThemedText style={styles.fileSize}>
                Size: {formatFileSize(latestVersion.fileSize)}
              </ThemedText>
            )}

            {latestVersion.releaseNotes && (
              <View style={styles.releaseNotesContainer}>
                <ThemedText style={styles.releaseNotesTitle}>What's New:</ThemedText>
                <ScrollView style={styles.releaseNotesScroll}>
                  <ThemedText style={styles.releaseNotes}>
                    {latestVersion.releaseNotes}
                  </ThemedText>
                </ScrollView>
              </View>
            )}
          </View>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.downloadButton]}
              onPress={handleDownload}
            >
              <MaterialIcons name="download" size={20} color="#fff" style={styles.buttonIcon} />
              <ThemedText style={styles.downloadButtonText}>Download Update</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.dismissButton]}
              onPress={onDismiss}
            >
              <ThemedText style={styles.dismissButtonText}>Later</ThemedText>
            </TouchableOpacity>
          </View>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    padding: 24,
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  content: {
    marginBottom: 24,
  },
  versionInfo: {
    fontSize: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  versionNumber: {
    fontWeight: '600',
    color: '#64748b',
  },
  latestVersionNumber: {
    fontWeight: '700',
    color: '#3b82f6',
  },
  fileSize: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 4,
  },
  releaseNotesContainer: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    maxHeight: 150,
  },
  releaseNotesTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: '#1e293b',
  },
  releaseNotesScroll: {
    maxHeight: 100,
  },
  releaseNotes: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 20,
  },
  buttonContainer: {
    gap: 12,
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  downloadButton: {
    backgroundColor: '#3b82f6',
  },
  downloadButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonIcon: {
    marginRight: 8,
  },
  dismissButton: {
    backgroundColor: '#f1f5f9',
  },
  dismissButtonText: {
    color: '#64748b',
    fontSize: 15,
    fontWeight: '500',
  },
});

