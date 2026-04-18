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
import { useFocusEffect } from '@react-navigation/native';
import { MaterialIconWithFallback } from '@/components/MaterialIconWithFallback';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import HeaderWithLogo from '@/components/HeaderWithLogo';
import SlideshowCard from '@/components/SlideshowCard';
import CreateSlideshowModal from '@/components/CreateSlideshowModal';
import SlideshowImageManager from '@/components/SlideshowImageManager';
import EditSlideshowModal from '@/components/EditSlideshowModal';
import SlideshowPreview from '@/components/SlideshowPreview';
import { slideshowsAPI } from '@/services/api';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import {
  performOptimisticUpdate,
  createOptimisticUpdater,
  updateOptimisticUpdater,
  deleteOptimisticUpdater,
} from '@/utils/optimisticUpdates';

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
  requirePhoneForPreview?: boolean;
  previewCouponId?: number | null;
  createdAt: string;
  images: SlideshowImage[];
  userId: number; // Added userId to Slideshow interface
}

export default function SlideshowsScreen() {
  const [slideshows, setSlideshows] = useState<Slideshow[]>([]);
  const [savingPreviewGateSlideshowIds, setSavingPreviewGateSlideshowIds] = useState<Set<number>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingSlideshow, setEditingSlideshow] = useState<Slideshow | null>(null);
  const [managingSlideshow, setManagingSlideshow] = useState<Slideshow | null>(null);
  const [previewingSlideshow, setPreviewingSlideshow] = useState<Slideshow | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    fetchSlideshows();
  }, []);

  // Reload data when screen comes into focus (fixes mobile tab navigation issue)
  useFocusEffect(
    React.useCallback(() => {
      fetchSlideshows();
    }, [])
  );

  const fetchSlideshows = async () => {
    try {
      const serverSlideshowsResponse = await slideshowsAPI.getAll();
      console.log('📥 Fetched slideshows from server:', serverSlideshowsResponse);
      
      // Extract slideshows array from response
      const serverSlideshows = serverSlideshowsResponse?.slideshows || serverSlideshowsResponse || [];
      console.log('📥 Extracted slideshows array:', serverSlideshows);
      
      // Ensure it's an array
      const slideshowsArray = Array.isArray(serverSlideshows) ? serverSlideshows : [];
      
      // Filter out any invalid slideshow objects
      const validSlideshows = slideshowsArray.filter((slideshow: any) => {
        if (!slideshow) {
          console.warn('🎬 SLIDESHOWS: Found null/undefined slideshow, filtering out');
          return false;
        }
        if (!slideshow.name) {
          console.warn('🎬 SLIDESHOWS: Found slideshow without name, filtering out:', slideshow);
          return false;
        }
        if (!slideshow.id) {
          console.warn('🎬 SLIDESHOWS: Found slideshow without id, filtering out:', slideshow);
          return false;
        }
        return true;
      });
      
      console.log('📥 Valid slideshows after filtering:', validSlideshows.length, validSlideshows);
      setSlideshows(validSlideshows);
    } catch (error) {
      console.error('Error fetching slideshows:', error);
      console.error('Error details:', error);
      setSlideshows([]); // Set empty array on error
      // Don't show alert, just log the error
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
      // Create temporary slideshow object for optimistic update
      const tempId = Date.now();
      const tempSlideshow: Slideshow = {
        id: tempId, // Temporary ID
        name: slideshowData.name,
        description: slideshowData.description,
        uniqueId: '',
        autoplayInterval: slideshowData.autoplayInterval,
        transition: slideshowData.transition,
        requiresActivationCode: slideshowData.requiresActivationCode,
        createdAt: new Date().toISOString(),
        images: [],
        userId: user?.id || 0,
      };
      
      // Optimistic update: immediately add to UI, then create on server
      const updatedState = await performOptimisticUpdate({
        currentState: slideshows,
        mutationType: 'create',
        optimisticUpdate: createOptimisticUpdater(tempSlideshow),
        serverMutation: async () => {
          const created = await slideshowsAPI.create(slideshowData);
          return created;
        },
        extractItem: (response) => response as Slideshow,
        getItemId: (s) => s.id,
        refreshState: fetchSlideshows,
        onError: (error) => {
          console.error('Error creating slideshow:', error);
          Alert.alert('Error', 'Failed to create slideshow. Please try again.');
        },
        onSuccess: (created) => {
          // Replace temp slideshow with real one from server
          setSlideshows(prev => prev.map(s => 
            s.id === tempId ? created : s
          ));
          setShowCreateModal(false);
        },
      });
      
      setSlideshows(updatedState);
      setShowCreateModal(false);
      Alert.alert('Success', 'Slideshow created successfully');
    } catch (error) {
      console.error('Error creating slideshow:', error);
      Alert.alert('Error', 'Failed to create slideshow');
    }
  };

  const handleDeleteSlideshow = async (slideshowId: number) => {
    console.log('🗑️ DELETE REQUEST: Slideshow ID:', slideshowId);

    const executeDelete = async () => {
      try {
        // Optimistic update: immediately remove from UI, then delete on server
        const updatedState = await performOptimisticUpdate({
          currentState: slideshows,
          mutationType: 'delete',
          optimisticUpdate: deleteOptimisticUpdater(slideshowId, (s) => s.id),
          serverMutation: async () => {
            await slideshowsAPI.delete(String(slideshowId));
            return { success: true };
          },
          getItemId: (s) => s.id,
          refreshState: fetchSlideshows,
          onError: (error) => {
            console.error('Failed to delete slideshow on server:', error);
            Alert.alert('Error', 'Failed to delete slideshow. The slideshow has been restored.');
          },
          onSuccess: () => {
            if (Platform.OS !== 'web') {
              Alert.alert('Success', 'Slideshow deleted successfully');
            }
          },
        });
        
        setSlideshows(updatedState);
      } catch (error) {
        console.error('Error deleting slideshow:', error);
        Alert.alert('Error', 'Failed to delete slideshow');
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

  const handleToggleRequirePhoneForPreview = async (slideshow: Slideshow) => {
    const sid = slideshow.id;
    if (savingPreviewGateSlideshowIds.has(sid)) return;
    const nextValue = !(slideshow.requirePhoneForPreview ?? false);
    setSavingPreviewGateSlideshowIds((prev) => new Set(prev).add(sid));
    const updated = { ...slideshow, requirePhoneForPreview: nextValue };
    try {
      const updatedState = await performOptimisticUpdate({
        currentState: slideshows,
        mutationType: 'update',
        optimisticUpdate: updateOptimisticUpdater(updated, (s) => s.id),
        serverMutation: async () => {
          return await slideshowsAPI.update(String(sid), { requirePhoneForPreview: nextValue });
        },
        getItemId: (s) => s.id,
        refreshState: fetchSlideshows,
        onError: (error: any) => {
          Alert.alert('Error', error?.response?.data?.error || 'Failed to update preview phone setting');
        },
      });
      setSlideshows(updatedState);
    } catch (error: any) {
      console.error('Slideshow preview gate toggle error:', error);
      Alert.alert('Error', error?.response?.data?.error || 'Failed to update preview phone setting');
    } finally {
      setSavingPreviewGateSlideshowIds((prev) => {
        const next = new Set(prev);
        next.delete(sid);
        return next;
      });
    }
  };

  const handlePreviewSlideshow = (slideshow: Slideshow) => {
    console.log(
      `▶️ Play button clicked for slideshow: "${slideshow.name}" (ID: ${slideshow.id})`
    );
    console.log(
      `❓ Is it locked? (requiresActivationCode): ${slideshow.requiresActivationCode}`
    );

    if (slideshow.requiresActivationCode) {
      console.log('➡️ Slideshow is locked. Navigating to access screen.');
      router.push(`/slideshow-access/${slideshow.id}`);
    } else {
      console.log('➡️ Slideshow is NOT locked. Navigating to slideshow player.');
      router.push(`/slideshow-player/${slideshow.id}`);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchSlideshows();
  };

  const filteredSlideshows = slideshows.filter(slideshow => {
    // Ensure slideshow has required properties
    if (!slideshow || !slideshow.name) {
      console.warn('🎬 SLIDESHOWS: Found slideshow with missing name, filtering out:', slideshow);
      return false;
    }
    
    return slideshow.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
           slideshow.description?.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <HeaderWithLogo
        title="Slideshows"
      />

      {/* Create Section with Red Text */}
      <View style={styles.createSection}>
        <TouchableOpacity 
          style={styles.createButtonContainer}
          onPress={() => setShowCreateModal(true)}
        >
          <MaterialIconWithFallback name="add" size={24} color="#3b82f6" />
          <Text style={styles.createText}>CLICK HERE TO CREATE NEW SLIDESHOW</Text>
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
        {/* Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{slideshows.length}</Text>
            <Text style={styles.statLabel}>Total Slideshows</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>
              {slideshows.reduce((total, slideshow) => {
                if (!slideshow || !slideshow.images) return total;
                return total + (slideshow.images.length || 0);
              }, 0)}
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
            <MaterialIconWithFallback name="add" size={20} color="#fff" />
            <Text style={styles.createButtonText}>Create Slideshow</Text>
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        {slideshows.length > 0 && (
          <View style={styles.searchContainer}>
            <MaterialIconWithFallback name="search" size={20} color="#6b7280" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search slideshows..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholderTextColor="#9ca3af"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <MaterialIconWithFallback name="clear" size={20} color="#6b7280" />
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
                onToggleRequirePhone={() => handleToggleRequirePhoneForPreview(slideshow)}
                requirePhoneSaving={savingPreviewGateSlideshowIds.has(slideshow.id)}
              />
            ))}
          </View>
        ) : (
          <View style={styles.emptyContainer}>
            <MaterialIconWithFallback name="slideshow" size={64} color="#9ca3af" />
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
                <MaterialIconWithFallback name="add" size={20} color="#fff" />
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
        slideshow={managingSlideshow ? slideshows.find(s => s.id === managingSlideshow.id) || managingSlideshow : null}
        onClose={() => setManagingSlideshow(null)}
        onImagesUpdated={(updatedSlideshow) => {
          // Defensive check to prevent undefined slideshow errors
          if (!updatedSlideshow || !updatedSlideshow.id) {
            console.error('🎬 SLIDESHOWS: Invalid slideshow update received:', updatedSlideshow);
            return;
          }
          
          // Optimistic update: immediately update UI, then refresh in background
          performOptimisticUpdate({
            currentState: slideshows,
            mutationType: 'update',
            optimisticUpdate: updateOptimisticUpdater(updatedSlideshow, (s) => s.id),
            serverMutation: async () => updatedSlideshow,
            getItemId: (s) => s.id,
            refreshState: fetchSlideshows,
            onError: (error) => {
              console.error('Error updating slideshow images:', error);
            },
          }).then(updatedState => {
            setSlideshows(updatedState);
          });
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
            if (updates.requirePhoneForPreview !== undefined) payload.requirePhoneForPreview = updates.requirePhoneForPreview;
            if (updates.previewCouponId !== undefined) payload.previewCouponId = updates.previewCouponId;

            // Create optimistic updated slideshow
            const optimisticSlideshow: Slideshow = {
              ...editingSlideshow,
              ...updates,
            };

            // Optimistic update: immediately update UI, then update on server
            const updatedState = await performOptimisticUpdate({
              currentState: slideshows,
              mutationType: 'update',
              optimisticUpdate: updateOptimisticUpdater(optimisticSlideshow, (s) => s.id),
              serverMutation: async () => {
                await slideshowsAPI.update(editingSlideshow.id, payload);
                // Fetch fresh object
                const fresh = await slideshowsAPI.getById(String(editingSlideshow.id));
                return fresh;
              },
              extractItem: (response) => response as Slideshow,
              getItemId: (s) => s.id,
              refreshState: fetchSlideshows,
              onError: (err) => {
                Alert.alert('Error', 'Failed to update slideshow. Changes have been reverted.');
                console.error('Update error', err);
              },
              onSuccess: (fresh) => {
                // Update with fresh data from server
                setSlideshows(prev => prev.map(s => (s.id === fresh.id ? fresh : s)));
                setEditingSlideshow(null);
              },
            });
            
            setSlideshows(updatedState);
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
  createSection: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  createButtonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  createText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.5,
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
