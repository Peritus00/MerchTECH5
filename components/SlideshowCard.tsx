import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface SlideshowImage {
  id: number;
  slideshowId: number;
  imageUrl: string;
  caption?: string;
  displayOrder: number;
}

interface Slideshow {
  id: number;
  name: string;
  description?: string;
  uniqueId: string;
  autoplayInterval: number;
  transition: string;
  audioUrl?: string;
  requiresActivationCode: boolean;
  createdAt: string;
  images: SlideshowImage[];
}

interface SlideshowCardProps {
  slideshow: Slideshow;
  onEdit: () => void;
  onDelete: () => void;
  onManageImages: () => void;
  onPreview: () => void;
  onLinkProducts: () => void;
}

const SlideshowCard: React.FC<SlideshowCardProps> = ({
  slideshow,
  onEdit,
  onDelete,
  onManageImages,
  onPreview,
  onLinkProducts,
}) => {
  const formatDate = (dateString?: string) => {
    if (!dateString) return '--';
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '--';
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getTransitionLabel = (transition: string) => {
    const transitions = {
      fade: 'Fade',
      slide: 'Slide',
      zoom: 'Zoom',
      none: 'None',
    };
    return transitions[transition] || transition;
  };

  const imagesArr = slideshow.images ?? [];
  const thumbnailImage = imagesArr.length > 0 ? imagesArr[0] : null;

  const intervalSeconds = typeof slideshow.autoplayInterval === 'number' && !isNaN(slideshow.autoplayInterval)
    ? Math.round(slideshow.autoplayInterval / 1000)
    : null;

  return (
    <View style={styles.card}>
      {/* Thumbnail */}
      <View style={styles.thumbnailContainer}>
        {thumbnailImage ? (
          <Image source={{ uri: thumbnailImage.imageUrl }} style={styles.thumbnail} />
        ) : (
          <View style={styles.placeholderThumbnail}>
            <MaterialIcons name="slideshow" size={32} color="#9ca3af" />
          </View>
        )}
        <View style={styles.imageCountBadge}>
          <Text style={styles.imageCountText}>{imagesArr.length}</Text>
        </View>
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Text style={styles.slideshowName} numberOfLines={2}>
          {slideshow.name}
        </Text>
        
        {slideshow.description && (
          <Text style={styles.slideshowDescription} numberOfLines={2}>
            {slideshow.description}
          </Text>
        )}

        <View style={styles.metadata}>
          <View style={styles.metadataRow}>
            <MaterialIcons name="timer" size={14} color="#6b7280" />
            <Text style={styles.metadataText}>
              {intervalSeconds !== null ? `${intervalSeconds}s intervals` : '—'}
            </Text>
          </View>
          <View style={styles.metadataRow}>
            <MaterialIcons name="swap-horiz" size={14} color="#6b7280" />
            <Text style={styles.metadataText}>
              {getTransitionLabel(slideshow.transition)}
            </Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.dateText}>{formatDate(slideshow.createdAt)}</Text>
          
          {slideshow.requiresActivationCode && (
            <View style={styles.protectedBadge}>
              <MaterialIcons name="lock" size={12} color="#f59e0b" />
              <Text style={styles.protectedText}>Protected</Text>
            </View>
          )}
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity style={[styles.actionButton, styles.previewButton]} onPress={onPreview}>
          <MaterialIcons name="play-arrow" size={18} color="#10b981" />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.actionButton} onPress={onLinkProducts}>
          <MaterialIcons name="link" size={18} color="#3b82f6" />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.actionButton} onPress={onManageImages}>
          <MaterialIcons name="photo-library" size={18} color="#3b82f6" />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.actionButton} onPress={onEdit}>
          <MaterialIcons name="edit" size={18} color="#6b7280" />
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.deleteButton} 
          onPress={onDelete}
        >
          <MaterialIcons name="delete" size={18} color="#ffffff" />
        </TouchableOpacity>
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
    overflow: 'hidden',
  },
  thumbnailContainer: {
    position: 'relative',
    height: 120,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  placeholderThumbnail: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageCountBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  imageCountText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  content: {
    padding: 16,
  },
  slideshowName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  slideshowDescription: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 12,
    lineHeight: 20,
  },
  metadata: {
    gap: 6,
    marginBottom: 12,
  },
  metadataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metadataText: {
    fontSize: 12,
    color: '#6b7280',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateText: {
    fontSize: 12,
    color: '#9ca3af',
  },
  protectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  protectedText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#f59e0b',
  },
  actions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#f8fafc',
  },
  previewButton: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#10b981',
  },
  deleteButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#ef4444',
  },
});

export default SlideshowCard;
