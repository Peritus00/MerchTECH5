
import React from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';

interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

interface UploadProgressModalProps {
  visible: boolean;
  progress: UploadProgress | null;
}

const UploadProgressModal: React.FC<UploadProgressModalProps> = ({ visible, progress }) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.title}>Uploading...</Text>
          {progress && (
            <>
              <View style={styles.progressBar}>
                <View 
                  style={[
                    styles.progressFill, 
                    { width: `${progress.percentage}%` }
                  ]} 
                />
              </View>
              <Text style={styles.progressText}>
                {progress.percentage.toFixed(0)}%
              </Text>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    minWidth: 200,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginTop: 16,
    marginBottom: 16,
  },
  progressBar: {
    width: 150,
    height: 4,
    backgroundColor: '#e5e7eb',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 8,
  },
});

export default UploadProgressModal;
