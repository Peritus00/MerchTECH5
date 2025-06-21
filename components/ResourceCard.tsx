
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface ResourceCardProps {
  resource: {
    name: string;
    description: string;
    url: string;
    category?: string;
    featured?: boolean;
  };
  onPress: () => void;
  featured?: boolean;
}

const ResourceCard: React.FC<ResourceCardProps> = ({
  resource,
  onPress,
  featured = false,
}) => {
  const getCategoryIcon = (category?: string) => {
    switch (category) {
      case 'distribution': return 'cloud-upload';
      case 'legal': return 'gavel';
      case 'production': return 'music-note';
      case 'business': return 'business';
      case 'marketing': return 'campaign';
      case 'education': return 'school';
      default: return 'link';
    }
  };

  const getCategoryColor = (category?: string) => {
    switch (category) {
      case 'distribution': return '#3b82f6';
      case 'legal': return '#ef4444';
      case 'production': return '#8b5cf6';
      case 'business': return '#10b981';
      case 'marketing': return '#f59e0b';
      case 'education': return '#06b6d4';
      default: return '#6b7280';
    }
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
    <TouchableOpacity
      style={[
        styles.card,
        featured && styles.featuredCard,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <View style={[
            styles.iconContainer,
            { backgroundColor: getCategoryColor(resource.category) + '20' }
          ]}>
            <MaterialIcons
              name={getCategoryIcon(resource.category) as any}
              size={20}
              color={getCategoryColor(resource.category)}
            />
          </View>
          
          {featured && (
            <View style={styles.featuredBadge}>
              <MaterialIcons name="star" size={12} color="#f59e0b" />
              <Text style={styles.featuredText}>Featured</Text>
            </View>
          )}
        </View>
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={2}>
            {resource.name}
          </Text>
          <Text style={styles.description} numberOfLines={3}>
            {resource.description}
          </Text>
          <Text style={styles.domain} numberOfLines={1}>
            {getDomainFromUrl(resource.url)}
          </Text>
        </View>
      </View>
      <View style={styles.footer}>
        <TouchableOpacity style={styles.openButton} onPress={onPress}>
          <MaterialIcons name="open-in-new" size={16} color="#3b82f6" />
          <Text style={styles.openButtonText}>Open</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  featuredCard: {
    borderWidth: 2,
    borderColor: '#f59e0b',
  },
  content: {
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featuredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  featuredText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#f59e0b',
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 6,
    lineHeight: 22,
  },
  description: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
    marginBottom: 8,
  },
  domain: {
    fontSize: 12,
    color: '#3b82f6',
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    paddingTop: 12,
  },
  openButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 4,
  },
  openButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3b82f6',
  },
});

export default ResourceCard;
