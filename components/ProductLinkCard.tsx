
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Linking,
  Alert,
  Switch,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { ProductLink } from '@/shared/media-schema';

interface ProductLinkCardProps {
  link: ProductLink;
  onEdit: () => void;
  onDelete: () => void;
  onToggleStatus: (isActive: boolean) => void;
}

const ProductLinkCard: React.FC<ProductLinkCardProps> = ({
  link,
  onEdit,
  onDelete,
  onToggleStatus,
}) => {
  const [imageError, setImageError] = useState(false);

  const handleOpenLink = async () => {
    try {
      const supported = await Linking.canOpenURL(link.url);
      if (supported) {
        await Linking.openURL(link.url);
      } else {
        Alert.alert('Error', 'Cannot open this URL');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to open link');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getDomainFromUrl = (url: string) => {
    try {
      const domain = new URL(url).hostname;
      return domain.replace('www.', '');
    } catch {
      return url;
    }
  };

  return (
    <View style={[styles.card, !link.isActive && styles.inactiveCard]}>
      <View style={styles.content}>
        {/* Image/Icon */}
        <View style={styles.imageContainer}>
          {link.imageUrl && !imageError ? (
            <Image
              source={{ uri: link.imageUrl }}
              style={styles.image}
              onError={() => setImageError(true)}
            />
          ) : (
            <View style={styles.placeholderImage}>
              <MaterialIcons name="shopping-bag" size={24} color="#9ca3af" />
            </View>
          )}
        </View>

        {/* Link Info */}
        <View style={styles.linkInfo}>
          <Text style={styles.linkTitle} numberOfLines={2}>
            {link.title}
          </Text>
          
          <Text style={styles.linkUrl} numberOfLines={1}>
            {getDomainFromUrl(link.url)}
          </Text>

          {link.description && (
            <Text style={styles.linkDescription} numberOfLines={2}>
              {link.description}
            </Text>
          )}

          <View style={styles.metadata}>
            <Text style={styles.metadataText}>
              Order: {link.displayOrder + 1}
            </Text>
            <Text style={styles.separator}>•</Text>
            <Text style={styles.metadataText}>
              {formatDate(link.createdAt)}
            </Text>
          </View>
        </View>

        {/* Status */}
        <View style={styles.statusContainer}>
          <View style={[
            styles.statusBadge,
            link.isActive ? styles.activeBadge : styles.inactiveBadge
          ]}>
            <View style={[
              styles.statusDot,
              { backgroundColor: link.isActive ? '#10b981' : '#6b7280' }
            ]} />
            <Text style={[
              styles.statusText,
              { color: link.isActive ? '#10b981' : '#6b7280' }
            ]}>
              {link.isActive ? 'Active' : 'Inactive'}
            </Text>
          </View>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={handleOpenLink}
        >
          <MaterialIcons name="open-in-new" size={18} color="#3b82f6" />
          <Text style={styles.actionButtonText}>Open</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={onEdit}
        >
          <MaterialIcons name="edit" size={18} color="#6b7280" />
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>

        <View style={styles.switchContainer}>
          <Switch
            value={link.isActive}
            onValueChange={onToggleStatus}
            trackColor={{ false: '#e5e7eb', true: '#bfdbfe' }}
            thumbColor={link.isActive ? '#3b82f6' : '#9ca3af'}
          />
        </View>

        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => {
            Alert.alert(
              'Delete Product Link',
              'Are you sure you want to delete this product link?',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: onDelete },
              ]
            );
          }}
        >
          <MaterialIcons name="delete" size={18} color="#ef4444" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  inactiveCard: {
    opacity: 0.7,
  },
  content: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  imageContainer: {
    marginRight: 12,
  },
  image: {
    width: 64,
    height: 64,
    borderRadius: 8,
  },
  placeholderImage: {
    width: 64,
    height: 64,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  linkInfo: {
    flex: 1,
  },
  linkTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  linkUrl: {
    fontSize: 12,
    color: '#3b82f6',
    marginBottom: 4,
  },
  linkDescription: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
    marginBottom: 8,
  },
  metadata: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metadataText: {
    fontSize: 12,
    color: '#9ca3af',
  },
  separator: {
    fontSize: 12,
    color: '#9ca3af',
    marginHorizontal: 6,
  },
  statusContainer: {
    marginLeft: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  activeBadge: {
    backgroundColor: '#d1fae5',
  },
  inactiveBadge: {
    backgroundColor: '#f3f4f6',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    gap: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#f8fafc',
    gap: 4,
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6b7280',
  },
  switchContainer: {
    marginLeft: 'auto',
    marginRight: 8,
  },
  deleteButton: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#fef2f2',
  },
});

export default ProductLinkCard;
