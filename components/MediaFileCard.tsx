
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { MediaFile } from '@/shared/media-schema';

interface MediaFileCardProps {
  file: MediaFile;
  onDelete: () => void;
  onPlay: () => void;
}

const MediaFileCard: React.FC<MediaFileCardProps> = ({ file, onDelete, onPlay }) => {
  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown size';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const getFileIcon = () => {
    if (file.fileType === 'audio' || file.contentType?.startsWith('audio/')) {
      return 'audiotrack';
    }
    if (file.fileType === 'video' || file.contentType?.startsWith('video/')) {
      return 'videocam';
    }
    return 'insert-drive-file';
  };

  const getFileTypeColor = () => {
    if (file.fileType === 'audio' || file.contentType?.startsWith('audio/')) {
      return '#8b5cf6';
    }
    if (file.fileType === 'video' || file.contentType?.startsWith('video/')) {
      return '#ef4444';
    }
    return '#6b7280';
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete File',
      `Are you sure you want to delete "${file.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: onDelete },
      ]
    );
  };

  return (
    <TouchableOpacity style={styles.card} onPress={onPlay} activeOpacity={0.7}>
      <View style={styles.content}>
        <View style={[styles.iconContainer, { backgroundColor: getFileTypeColor() + '20' }]}>
          <MaterialIcons
            name={getFileIcon() as any}
            size={24}
            color={getFileTypeColor()}
          />
        </View>
        <View style={styles.fileInfo}>
          <Text style={styles.fileName} numberOfLines={2}>
            {file.title}
          </Text>
          
          <View style={styles.metadata}>
            <Text style={styles.fileType}>
              {file.contentType?.replace(/^(audio|video)\//, '').toUpperCase() || file.fileType?.toUpperCase() || 'UNKNOWN'}
            </Text>
            <Text style={styles.separator}>•</Text>
            <Text style={styles.fileSize}>
              {formatFileSize(file.filesize)}
            </Text>
          </View>
          <Text style={styles.createdAt}>
            {new Date(file.createdAt).toLocaleDateString()}
          </Text>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={(e) => {
              e.stopPropagation();
              onPlay();
            }}
          >
            <MaterialIcons name="play-arrow" size={20} color="#3b82f6" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
          >
            <MaterialIcons name="delete" size={20} color="#ef4444" />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  metadata: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  fileType: {
    fontSize: 12,
    color: '#8b5cf6',
    fontWeight: '500',
  },
  separator: {
    fontSize: 12,
    color: '#9ca3af',
    marginHorizontal: 8,
  },
  fileSize: {
    fontSize: 12,
    color: '#6b7280',
  },
  createdAt: {
    fontSize: 12,
    color: '#9ca3af',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default MediaFileCard;
