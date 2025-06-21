
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { router } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Playlist, ProductLink } from '@/shared/media-schema';
import ProductLinkCard from '@/components/ProductLinkCard';
import CreateProductLinkModal from '@/components/CreateProductLinkModal';

export default function ProductLinkManagerScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { id } = route.params as { id: string };
  
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [productLinks, setProductLinks] = useState<ProductLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingLink, setEditingLink] = useState<ProductLink | null>(null);

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    try {
      // Mock data - replace with actual API calls
      const mockPlaylist: Playlist = {
        id: id,
        userId: 1,
        name: 'My Awesome Playlist',
        requiresActivationCode: false,
        isPublic: true,
        createdAt: new Date().toISOString(),
        mediaFiles: [],
      };

      const mockProductLinks: ProductLink[] = [
        {
          id: 1,
          playlistId: id,
          title: 'Limited Edition T-Shirt',
          url: 'https://example.com/tshirt',
          description: 'Premium cotton t-shirt with exclusive design',
          imageUrl: 'https://example.com/tshirt.jpg',
          displayOrder: 0,
          isActive: true,
          createdAt: new Date().toISOString(),
        },
        {
          id: 2,
          playlistId: id,
          title: 'Album Vinyl Record',
          url: 'https://example.com/vinyl',
          description: 'High-quality vinyl pressing of our latest album',
          displayOrder: 1,
          isActive: false,
          createdAt: new Date().toISOString(),
        },
      ];
      
      setPlaylist(mockPlaylist);
      setProductLinks(mockProductLinks.sort((a, b) => a.displayOrder - b.displayOrder));
    } catch (error) {
      console.error('Error fetching data:', error);
      Alert.alert('Error', 'Failed to load product links');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const handleCreateLink = async (linkData: {
    title: string;
    url: string;
    description?: string;
    imageUrl?: string;
  }) => {
    try {
      const newLink: ProductLink = {
        id: Date.now(),
        playlistId: id,
        title: linkData.title,
        url: linkData.url,
        description: linkData.description,
        imageUrl: linkData.imageUrl,
        displayOrder: productLinks.length,
        isActive: true,
        createdAt: new Date().toISOString(),
      };

      setProductLinks(prev => [...prev, newLink]);
      setShowCreateModal(false);
      Alert.alert('Success', 'Product link created successfully');
    } catch (error) {
      console.error('Error creating product link:', error);
      Alert.alert('Error', 'Failed to create product link');
    }
  };

  const handleUpdateLink = async (linkId: number, updateData: Partial<ProductLink>) => {
    try {
      setProductLinks(prev => 
        prev.map(link => link.id === linkId ? { ...link, ...updateData } : link)
      );
      setEditingLink(null);
      Alert.alert('Success', 'Product link updated successfully');
    } catch (error) {
      console.error('Error updating product link:', error);
      Alert.alert('Error', 'Failed to update product link');
    }
  };

  const handleDeleteLink = async (linkId: number) => {
    Alert.alert(
      'Delete Product Link',
      'Are you sure you want to delete this product link?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setProductLinks(prev => prev.filter(link => link.id !== linkId));
              Alert.alert('Success', 'Product link deleted');
            } catch (error) {
              console.error('Error deleting product link:', error);
              Alert.alert('Error', 'Failed to delete product link');
            }
          },
        },
      ]
    );
  };

  const handleToggleLinkStatus = async (linkId: number, isActive: boolean) => {
    try {
      setProductLinks(prev => 
        prev.map(link => link.id === linkId ? { ...link, isActive } : link)
      );
    } catch (error) {
      console.error('Error updating product link:', error);
      Alert.alert('Error', 'Failed to update product link');
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  if (isLoading || !playlist) {
    return (
      <ThemedView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <ThemedText style={styles.loadingText}>Loading product links...</ThemedText>
      </ThemedView>
    );
  }

  const activeLinks = productLinks.filter(link => link.isActive);
  const inactiveLinks = productLinks.filter(link => !link.isActive);

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={24} color="#1f2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Product Links</Text>
        <TouchableOpacity onPress={() => setShowCreateModal(true)}>
          <MaterialIcons name="add" size={24} color="#3b82f6" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Playlist Info */}
        <View style={styles.playlistInfo}>
          <Text style={styles.playlistName} numberOfLines={2}>
            {playlist.name}
          </Text>
          <Text style={styles.playlistSubtitle}>
            {productLinks.length} product links
          </Text>
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => setShowCreateModal(true)}
          >
            <MaterialIcons name="add" size={20} color="#3b82f6" />
            <Text style={styles.actionButtonText}>Add Link</Text>
          </TouchableOpacity>
        </View>

        {/* Product Links List */}
        {activeLinks.length > 0 && (
          <View style={styles.linkGroup}>
            <Text style={styles.groupTitle}>
              Active Links ({activeLinks.length})
            </Text>
            {activeLinks.map((link) => (
              <ProductLinkCard
                key={link.id}
                link={link}
                onEdit={() => setEditingLink(link)}
                onDelete={() => handleDeleteLink(link.id)}
                onToggleStatus={(isActive) => handleToggleLinkStatus(link.id, isActive)}
              />
            ))}
          </View>
        )}

        {inactiveLinks.length > 0 && (
          <View style={styles.linkGroup}>
            <Text style={styles.groupTitle}>
              Inactive Links ({inactiveLinks.length})
            </Text>
            {inactiveLinks.map((link) => (
              <ProductLinkCard
                key={link.id}
                link={link}
                onEdit={() => setEditingLink(link)}
                onDelete={() => handleDeleteLink(link.id)}
                onToggleStatus={(isActive) => handleToggleLinkStatus(link.id, isActive)}
              />
            ))}
          </View>
        )}

        {/* Empty State */}
        {productLinks.length === 0 && (
          <View style={styles.emptyContainer}>
            <MaterialIcons name="shopping-bag" size={64} color="#9ca3af" />
            <Text style={styles.emptyText}>No product links yet</Text>
            <Text style={styles.emptySubtext}>
              Add product links to promote merchandise and products related to this playlist
            </Text>
            <TouchableOpacity
              style={styles.createButton}
              onPress={() => setShowCreateModal(true)}
            >
              <MaterialIcons name="add" size={20} color="#fff" />
              <Text style={styles.createButtonText}>Add First Link</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Create/Edit Product Link Modal */}
      <CreateProductLinkModal
        visible={showCreateModal || !!editingLink}
        onClose={() => {
          setShowCreateModal(false);
          setEditingLink(null);
        }}
        onSave={editingLink 
          ? (data) => handleUpdateLink(editingLink.id, data)
          : handleCreateLink
        }
        initialData={editingLink}
        playlistName={playlist.name}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  playlistInfo: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  playlistName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4,
  },
  playlistSubtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  quickActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  linkGroup: {
    marginBottom: 24,
  },
  groupTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6b7280',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    paddingHorizontal: 32,
    marginBottom: 24,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
