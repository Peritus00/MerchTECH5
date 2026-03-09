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
import InlineMediaPlayer from './InlineMediaPlayer';

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
    if (file.fileType === 'image' || file.contentType?.startsWith('image/') || file.type === 'image') {
      return 'image';
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
    if (file.fileType === 'image' || file.contentType?.startsWith('image/') || file.type === 'image') {
      return '#10b981';
    }
    return '#6b7280';
  };

  const handleDelete = () => {
    console.log('🔴 MediaFileCard: Delete button pressed for file:', {
      id: file.id,
      title: file.title,
      timestamp: new Date().toISOString()
    });

    console.log('🔴 MediaFileCard: Calling onDelete prop for file:', file.id);
    console.log('🔴 MediaFileCard: onDelete prop type:', typeof onDelete);
    console.log('🔴 MediaFileCard: onDelete prop exists:', !!onDelete);

    if (onDelete && typeof onDelete === 'function') {
      console.log('🔴 MediaFileCard: Executing onDelete callback...');
      onDelete();
      console.log('🔴 MediaFileCard: onDelete callback executed successfully');
    } else {
      console.error('🔴 MediaFileCard: onDelete prop is not a valid function!');
    }
  };

  return (
    <View style={styles.card}>
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
              {file.contentType?.replace(/^(audio|video|image)\//, '').toUpperCase() || file.fileType?.toUpperCase() || 'UNKNOWN'}
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
          {/* Use InlineMediaPlayer instead of navigation */}
          <View style={styles.actionButton}>
            <InlineMediaPlayer 
              file={file}
              size={20}
              color="#3b82f6"
            />
          </View>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={(e) => {
              console.log('🔴 MediaFileCard: Delete button touched for file:', file.id);
              handleDelete();
            }}
          >
            <MaterialIcons name="delete" size={20} color="#ef4444" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
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