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
  TextInput,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import HeaderWithLogo from '@/components/HeaderWithLogo';
import SlideshowCard from '@/components/SlideshowCard';
import CreateSlideshowModal from '@/components/CreateSlideshowModal';
import SlideshowImageManager from '@/components/SlideshowImageManager';
import EditSlideshowModal from '@/components/EditSlideshowModal';
import SlideshowPreview from '@/components/SlideshowPreview';
import { slideshowAPI } from '@/services/api';
import { useRouter } from 'expo-router';

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

export default function SlideshowsScreen() {
  const [slideshows, setSlideshows] = useState<Slideshow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingSlideshow, setEditingSlideshow] = useState<Slideshow | null>(null);
  const [managingSlideshow, setManagingSlideshow] = useState<Slideshow | null>(null);
  const [previewingSlideshow, setPreviewingSlideshow] = useState<Slideshow | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetchSlideshows();
  }, []);

  const fetchSlideshows = async () => {
    try {
      const serverSlideshows = await slideshowAPI.getAll();
      console.log('📥 Fetched slideshows from server:', serverSlideshows);
      setSlideshows(serverSlideshows);
    } catch (error) {
      console.error('Error fetching slideshows:', error);
      Alert.alert('Error', 'Failed to load slideshows');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const handleCreateSlideshow = async (slideshowData: {
    name: string;
    description?: string;
    autoplayInterval: number;
    transition: string;
    requiresActivationCode: boolean;
  }) => {
    try {
      const created = await slideshowAPI.create(slideshowData);
      setSlideshows(prev => [created, ...prev]);
      setShowCreateModal(false);
      Alert.alert('Success', 'Slideshow created successfully');
    } catch (error) {
      console.error('Error creating slideshow:', error);
      Alert.alert('Error', 'Failed to create slideshow');
    }
  };

  const handleDeleteSlideshow = async (slideshowId: number) => {
    console.log('🗑️ DELETE REQUEST: Slideshow ID:', slideshowId);
    console.log('🗑️ Current slideshows count before delete:', slideshows.length);

    const executeDelete = () => {
      console.log('🗑️ Confirmed delete, filtering slideshows...');
      slideshowAPI.delete(String(slideshowId)).catch(err =>
        console.error('Failed to delete slideshow on server:', err)
      );
      setSlideshows(prev => prev.filter(slideshow => slideshow.id !== slideshowId));
      setTimeout(() => {
        console.log('🗑️ Slideshows count after delete:', slideshows.length - 1);
      }, 0);
      if (Platform.OS !== 'web') {
        Alert.alert('Success', 'Slideshow deleted successfully');
      }
    };

    if (Platform.OS === 'web') {
      const confirmed = window.confirm('Are you sure you want to delete this slideshow? This action cannot be undone.');
      if (confirmed) {
        executeDelete();
      } else {
        console.log('🗑️ Delete cancelled');
      }
    } else {
      Alert.alert(
        'Delete Slideshow',
        'Are you sure you want to delete this slideshow? This action cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => console.log('🗑️ Delete cancelled') },
          { text: 'Delete', style: 'destructive', onPress: executeDelete },
        ]
      );
    }
  };

  const handlePreviewSlideshow = (slideshow: Slideshow) => {
    console.log('🎬 PLAY pressed on slideshow', slideshow.id, 'protected?', slideshow.requiresActivationCode);

    // Always send user to the access-gate screen for activation code / preview options
    // This ensures all slideshows go through the access control flow
    router.push(`/slideshow-access/${slideshow.id}`);
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchSlideshows();
  };

  const filteredSlideshows = slideshows.filter(slideshow =>
    slideshow.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    slideshow.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <HeaderWithLogo
        title="Slideshows"
        onRightButtonPress={() => setShowCreateModal(true)}
        rightButtonIcon="add"
        rightButtonColor="#3b82f6"
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{slideshows.length}</Text>
            <Text style={styles.statLabel}>Total Slideshows</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>
              {slideshows.reduce((total, slideshow) => total + (slideshow.images?.length || 0), 0)}
            </Text>
            <Text style={styles.statLabel}>Total Images</Text>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => setShowCreateModal(true)}
          >
            <MaterialIcons name="add" size={20} color="#fff" />
            <Text style={styles.createButtonText}>Create Slideshow</Text>
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        {slideshows.length > 0 && (
          <View style={styles.searchContainer}>
            <MaterialIcons name="search" size={20} color="#6b7280" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search slideshows..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholderTextColor="#9ca3af"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <MaterialIcons name="clear" size={20} color="#6b7280" />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Slideshows List */}
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3b82f6" />
            <Text style={styles.loadingText}>Loading slideshows...</Text>
          </View>
        ) : filteredSlideshows.length > 0 ? (
          <View style={styles.slideshowsList}>
            {filteredSlideshows.map((slideshow) => (
              <SlideshowCard
                key={slideshow.id}
                slideshow={slideshow}
                onEdit={() => {
                  console.log('✏️ Edit button pressed for slideshow:', slideshow.id);
                  setEditingSlideshow(slideshow);
                }}
                onDelete={() => handleDeleteSlideshow(slideshow.id)}
                onManageImages={() => setManagingSlideshow(slideshow)}
                onPreview={() => handlePreviewSlideshow(slideshow)}
                onLinkProducts={() => {
                  console.log('🔗 Link products pressed for slideshow', slideshow.id);
                  router.push(`/product-links/${slideshow.id}?type=slideshow`);
                }}
              />
            ))}
          </View>
        ) : (
          <View style={styles.emptyContainer}>
            <MaterialIcons name="slideshow" size={64} color="#9ca3af" />
            <Text style={styles.emptyText}>
              {searchQuery ? 'No slideshows found' : 'No slideshows yet'}
            </Text>
            <Text style={styles.emptySubtext}>
              {searchQuery
                ? 'Try adjusting your search terms'
                : 'Create your first slideshow to get started with image presentations'
              }
            </Text>
            {!searchQuery && (
              <TouchableOpacity
                style={styles.createFirstButton}
                onPress={() => setShowCreateModal(true)}
              >
                <MaterialIcons name="add" size={20} color="#fff" />
                <Text style={styles.createFirstButtonText}>Create First Slideshow</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>

      {/* Modals */}
      <CreateSlideshowModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreateSlideshow={handleCreateSlideshow}
      />

      <SlideshowImageManager
        visible={!!managingSlideshow}
        slideshow={managingSlideshow}
        onClose={() => setManagingSlideshow(null)}
        onImagesUpdated={(updatedSlideshow) => {
          setSlideshows(prev =>
            prev.map(s => s.id === updatedSlideshow.id ? updatedSlideshow : s)
          );
        }}
      />

      {/* Edit Modal */}
      <EditSlideshowModal
        visible={!!editingSlideshow}
        slideshow={editingSlideshow}
        onClose={() => setEditingSlideshow(null)}
        onSave={async (updates) => {
          if (!editingSlideshow) return;
          try {
            // backend expects camelCase keys
            const payload: any = {};
            if (updates.name !== undefined) payload.name = updates.name;
            if (updates.description !== undefined) payload.description = updates.description;
            if (updates.transition !== undefined) payload.transition = updates.transition;
            if (updates.autoplayInterval !== undefined) payload.autoplayInterval = updates.autoplayInterval;
            if (updates.requiresActivationCode !== undefined) payload.requiresActivationCode = updates.requiresActivationCode;

            console.log('📤 PATCH payload:', payload);
            await slideshowAPI.update(editingSlideshow.id, payload);

            // fetch fresh object
            const fresh = await slideshowAPI.getById(String(editingSlideshow.id));
            console.log('📥 Fresh slideshow:', fresh);

            setSlideshows(prev => prev.map(s => (s.id === fresh.id ? fresh : s)));
            setEditingSlideshow(null);
          } catch (err) {
            Alert.alert('Error', 'Failed to update slideshow');
            console.error('Update error', err);
          }
        }}
      />

      <SlideshowPreview
        visible={showPreviewModal}
        slideshow={previewingSlideshow}
        skipAccessCheck={true}
        onClose={() => {
          setShowPreviewModal(false);
          setPreviewingSlideshow(null);
        }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
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
  statsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#3b82f6',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
  },
  quickActions: {
    marginBottom: 16,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#1f2937',
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6b7280',
  },
  slideshowsList: {
    gap: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6b7280',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    paddingHorizontal: 32,
    marginBottom: 24,
    lineHeight: 20,
  },
  createFirstButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
  },
  createFirstButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
