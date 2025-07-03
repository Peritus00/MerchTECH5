import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Playlist } from '@/shared/media-schema';

interface PlaylistCardProps {
  playlist: Playlist;
  onView: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onToggleProtection?: () => void;
  onAccessSettings?: () => void;
  showActions?: boolean;
}

const PlaylistCard: React.FC<PlaylistCardProps> = ({
  playlist,
  onView,
  onEdit,
  onDelete,
  onToggleProtection,
  onAccessSettings,
  showActions = true,
}) => {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getPlaylistThumbnail = () => {
    // Try to get thumbnail from first media file that has an image or video
    const mediaWithThumbnail = playlist.mediaFiles?.find(file => 
      file.contentType?.startsWith('image/') || file.contentType?.startsWith('video/')
    );
    return mediaWithThumbnail?.url;
  };

  const getMediaTypeIcon = (mediaFile: any) => {
    if (mediaFile.contentType?.startsWith('audio/')) return 'audiotrack';
    if (mediaFile.contentType?.startsWith('video/')) return 'videocam';
    if (mediaFile.contentType?.startsWith('image/')) return 'image';
    return 'insert-drive-file';
  };

  const thumbnail = getPlaylistThumbnail();

  return (
    <View style={styles.card}>
      <View style={styles.content}>
        {/* Thumbnail */}
        <View style={styles.thumbnailContainer}>
          {thumbnail ? (
            <Image source={{ uri: thumbnail }} style={styles.thumbnail} />
          ) : (
            <View style={styles.placeholderThumbnail}>
              <MaterialIcons name="queue-music" size={32} color="#9ca3af" />
            </View>
          )}
          
          {/* Media count overlay */}
          <View style={styles.mediaCountOverlay}>
            <Text style={styles.mediaCountText}>
              {playlist.mediaFiles?.length || 0}
            </Text>
          </View>
        </View>

        {/* Playlist Info */}
        <View style={styles.playlistInfo}>
          <Text style={styles.playlistName} numberOfLines={2}>
            {playlist.name}
          </Text>
          
          <View style={styles.metadata}>
            <View style={styles.metadataRow}>
              <MaterialIcons name="access-time" size={12} color="#9ca3af" />
              <Text style={styles.metadataText}>
                {formatDate(playlist.createdAt)}
              </Text>
            </View>
            
            {playlist.isPublic && (
              <View style={styles.metadataRow}>
                <MaterialIcons name="public" size={12} color="#10b981" />
                <Text style={[styles.metadataText, { color: '#10b981' }]}>
                  Public
                </Text>
              </View>
            )}
          </View>

          {/* Media preview */}
          <View style={styles.mediaPreview}>
            {playlist.mediaFiles?.slice(0, 3).map((file, index) => (
              <View key={file.id} style={styles.mediaItem}>
                <MaterialIcons
                  name={getMediaTypeIcon(file)}
                  size={14}
                  color="#6b7280"
                />
                <Text style={styles.mediaTitle} numberOfLines={1}>
                  {file.title}
                </Text>
              </View>
            ))}
            {(playlist.mediaFiles?.length || 0) > 3 && (
              <Text style={styles.moreMedia}>
                +{(playlist.mediaFiles?.length || 0) - 3} more
              </Text>
            )}
          </View>
        </View>

        {/* Actions */}
        {showActions && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => {
                console.log('🔴 PLAYLIST_CARD: Play button pressed for playlist:', {
                  id: playlist.id,
                  name: playlist.name,
                  hasMediaFiles: !!(playlist.mediaFiles && playlist.mediaFiles.length > 0),
                  mediaCount: playlist.mediaFiles?.length || 0
                });
                console.log('🔴 PLAYLIST_CARD: Calling onView function...');
                onView();
                console.log('🔴 PLAYLIST_CARD: onView function called');
              }}
            >
              <MaterialIcons name="play-arrow" size={20} color="#3b82f6" />
            </TouchableOpacity>
            {onToggleProtection && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => {
                  console.log('🔴 PLAYLIST_CARD: Shield icon pressed for playlist:', playlist.id, 'Current protection:', playlist.requiresActivationCode);
                  onToggleProtection();
                }}
              >
                <MaterialIcons 
                  name={(playlist.requiresActivationCode ?? false) ? "lock" : "lock-open"} 
                  size={20} 
                  color={(playlist.requiresActivationCode ?? false) ? "#f59e0b" : "#9ca3af"} 
                />
              </TouchableOpacity>
            )}
            {onAccessSettings && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => {
                  onAccessSettings();
                }}
              >
                <MaterialIcons name="settings" size={20} color="#9ca3af" />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => {
                // Navigate to product links manager
                router.push(`/product-links/${playlist.id}`);
              }}
            >
              <MaterialIcons name="shopping-bag" size={20} color="#9ca3af" />
            </TouchableOpacity>
            {onEdit && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => {
                  onEdit();
                }}
              >
                <MaterialIcons name="edit" size={20} color="#6b7280" />
              </TouchableOpacity>
            )}
            {onDelete && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => {
                  onDelete();
                }}
              >
                <MaterialIcons name="delete" size={20} color="#ef4444" />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  content: {
    flexDirection: 'row',
    padding: 16,
  },
  thumbnailContainer: {
    position: 'relative',
    marginRight: 16,
  },
  thumbnail: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  placeholderThumbnail: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaCountOverlay: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  mediaCountText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  playlistInfo: {
    flex: 1,
  },
  playlistName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 8,
  },
  metadata: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  metadataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metadataText: {
    fontSize: 12,
    color: '#9ca3af',
  },
  mediaPreview: {
    flex: 1,
  },
  mediaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  mediaTitle: {
    flex: 1,
    fontSize: 12,
    color: '#6b7280',
  },
  moreMedia: {
    fontSize: 12,
    color: '#9ca3af',
    fontStyle: 'italic',
    marginTop: 2,
  },
  actions: {
    justifyContent: 'flex-start',
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

export default PlaylistCard;