import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Text,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/contexts/AuthContext';
import { adminAPI } from '@/services/api';
import { DeletedQRCode, DeletedPlaylist, DeletedSlideshow, DeletedActivationCode } from '@/types';

type TabType = 'qr-codes' | 'playlists' | 'slideshows' | 'activation-codes';

interface GroupedItems {
  [userId: number]: {
    owner_username: string;
    owner_email: string;
    items: (DeletedQRCode | DeletedPlaylist | DeletedSlideshow | DeletedActivationCode)[];
  };
}

export default function RestoreDeletedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('qr-codes');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [deletedQRCodes, setDeletedQRCodes] = useState<DeletedQRCode[]>([]);
  const [deletedPlaylists, setDeletedPlaylists] = useState<DeletedPlaylist[]>([]);
  const [deletedSlideshows, setDeletedSlideshows] = useState<DeletedSlideshow[]>([]);
  const [deletedActivationCodes, setDeletedActivationCodes] = useState<DeletedActivationCode[]>([]);
  
  const [restoringIds, setRestoringIds] = useState<Set<number>>(new Set());

  // Check admin access
  useEffect(() => {
    if (user === null) {
      return;
    }
    if (!user.isAdmin && user.email !== 'djjetfuel@gmail.com') {
      Alert.alert('Access Denied', 'You do not have permission to access this page', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    }
  }, [user, router]);

  const fetchDeletedItems = async () => {
    try {
      setLoading(true);
      const [qrCodes, playlists, slideshows, activationCodes] = await Promise.all([
        adminAPI.getDeletedQRCodes(),
        adminAPI.getDeletedPlaylists(),
        adminAPI.getDeletedSlideshows(),
        adminAPI.getDeletedActivationCodes(),
      ]);
      
      setDeletedQRCodes(qrCodes);
      setDeletedPlaylists(playlists);
      setDeletedSlideshows(slideshows);
      setDeletedActivationCodes(activationCodes);
    } catch (error: any) {
      console.error('Error fetching deleted items:', error);
      Alert.alert('Error', error.message || 'Failed to fetch deleted items');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (user?.isAdmin || user?.email === 'djjetfuel@gmail.com') {
      fetchDeletedItems();
    }
  }, [user]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchDeletedItems();
  };

  const groupItemsByUser = <T extends { owner_id: number; owner_username: string; owner_email: string }>(
    items: T[]
  ): GroupedItems => {
    const grouped: GroupedItems = {};
    items.forEach((item) => {
      if (!grouped[item.owner_id]) {
        grouped[item.owner_id] = {
          owner_username: item.owner_username,
          owner_email: item.owner_email,
          items: [],
        };
      }
      grouped[item.owner_id].items.push(item);
    });
    return grouped;
  };

  const filterItems = <T extends { name?: string; code?: string; owner_username?: string; owner_email?: string }>(
    items: T[]
  ): T[] => {
    if (!searchQuery.trim()) return items;
    const query = searchQuery.toLowerCase();
    return items.filter(
      (item) =>
        item.name?.toLowerCase().includes(query) ||
        item.code?.toLowerCase().includes(query) ||
        item.owner_username?.toLowerCase().includes(query) ||
        item.owner_email?.toLowerCase().includes(query)
    );
  };

  const formatDaysAgo = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return '1 day ago';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
  };

  const getDaysUntilExpiry = (dateString: string): number => {
    const date = new Date(dateString);
    const now = new Date();
    const expiryDate = new Date(date);
    expiryDate.setDate(expiryDate.getDate() + 90);
    const diffTime = expiryDate.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const handleRestore = async (
    id: number,
    type: TabType,
    name: string
  ) => {
    console.log('🔄 RESTORE: Restore button clicked', { id, type, name });
    
    Alert.alert(
      'Restore Item',
      `Are you sure you want to restore "${name}"? The item will be immediately visible to the original owner.`,
      [
        { 
          text: 'Cancel', 
          style: 'cancel',
          onPress: () => {
            console.log('🔄 RESTORE: User cancelled restore');
          }
        },
        {
          text: 'Restore',
          style: 'default',
          onPress: async () => {
            try {
              console.log('🔄 RESTORE: User confirmed restore, starting restore process...', { id, type });
              setRestoringIds((prev) => new Set(prev).add(id));
              
              let result;
              if (type === 'qr-codes') {
                console.log('🔄 RESTORE: Calling adminAPI.restoreQRCode...', id);
                result = await adminAPI.restoreQRCode(id);
                console.log('🔄 RESTORE: restoreQRCode response:', result);
              } else if (type === 'playlists') {
                console.log('🔄 RESTORE: Calling adminAPI.restorePlaylist...', id);
                result = await adminAPI.restorePlaylist(id);
                console.log('🔄 RESTORE: restorePlaylist response:', result);
              } else if (type === 'slideshows') {
                console.log('🔄 RESTORE: Calling adminAPI.restoreSlideshow...', id);
                result = await adminAPI.restoreSlideshow(id);
                console.log('🔄 RESTORE: restoreSlideshow response:', result);
              } else if (type === 'activation-codes') {
                console.log('🔄 RESTORE: Calling adminAPI.restoreActivationCode...', id);
                result = await adminAPI.restoreActivationCode(id);
                console.log('🔄 RESTORE: restoreActivationCode response:', result);
              }
              
              console.log('🔄 RESTORE: Restore successful, refreshing list...');
              Alert.alert('Success', 'Item restored successfully');
              await fetchDeletedItems();
              console.log('🔄 RESTORE: List refreshed after restore');
            } catch (error: any) {
              console.error('🔄 RESTORE: Error restoring item:', error);
              console.error('🔄 RESTORE: Error details:', {
                message: error.message,
                response: error.response?.data,
                status: error.response?.status,
                statusText: error.response?.statusText,
              });
              Alert.alert(
                'Error', 
                error.response?.data?.error || error.message || 'Failed to restore item'
              );
            } finally {
              console.log('🔄 RESTORE: Clearing restoring state for id:', id);
              setRestoringIds((prev) => {
                const next = new Set(prev);
                next.delete(id);
                return next;
              });
            }
          },
        },
      ]
    );
  };

  const renderQRCodeItem = (item: DeletedQRCode) => {
    const daysAgo = formatDaysAgo(item.deleted_at);
    const daysUntilExpiry = getDaysUntilExpiry(item.deleted_at);
    const isRestoring = restoringIds.has(item.id);
    
    return (
      <View key={item.id} style={styles.itemCard}>
        <View style={styles.itemHeader}>
          <ThemedText style={styles.itemName}>{item.name}</ThemedText>
          <TouchableOpacity
            style={styles.restoreButton}
            onPress={() => handleRestore(item.id, 'qr-codes', item.name)}
            disabled={isRestoring}
          >
            {isRestoring ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <MaterialIcons name="restore" size={18} color="#fff" />
                <ThemedText style={styles.restoreButtonText}>Restore</ThemedText>
              </>
            )}
          </TouchableOpacity>
        </View>
        {item.description && (
          <ThemedText style={styles.itemDescription}>{item.description}</ThemedText>
        )}
        <View style={styles.itemMeta}>
          <ThemedText style={styles.metaText}>Deleted: {daysAgo}</ThemedText>
          {daysUntilExpiry < 30 && (
            <ThemedText style={styles.warningText}>
              Expires in {daysUntilExpiry} days
            </ThemedText>
          )}
        </View>
      </View>
    );
  };

  const renderPlaylistItem = (item: DeletedPlaylist) => {
    const daysAgo = formatDaysAgo(item.deleted_at);
    const daysUntilExpiry = getDaysUntilExpiry(item.deleted_at);
    const isRestoring = restoringIds.has(item.id);
    
    return (
      <View key={item.id} style={styles.itemCard}>
        <View style={styles.itemHeader}>
          <ThemedText style={styles.itemName}>{item.name}</ThemedText>
          <TouchableOpacity
            style={styles.restoreButton}
            onPress={() => handleRestore(item.id, 'playlists', item.name)}
            disabled={isRestoring}
          >
            {isRestoring ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <MaterialIcons name="restore" size={18} color="#fff" />
                <ThemedText style={styles.restoreButtonText}>Restore</ThemedText>
              </>
            )}
          </TouchableOpacity>
        </View>
        {item.description && (
          <ThemedText style={styles.itemDescription}>{item.description}</ThemedText>
        )}
        <View style={styles.itemMeta}>
          <ThemedText style={styles.metaText}>Deleted: {daysAgo}</ThemedText>
          {daysUntilExpiry < 30 && (
            <ThemedText style={styles.warningText}>
              Expires in {daysUntilExpiry} days
            </ThemedText>
          )}
        </View>
      </View>
    );
  };

  const renderSlideshowItem = (item: DeletedSlideshow) => {
    const daysAgo = formatDaysAgo(item.deleted_at);
    const daysUntilExpiry = getDaysUntilExpiry(item.deleted_at);
    const isRestoring = restoringIds.has(item.id);
    
    return (
      <View key={item.id} style={styles.itemCard}>
        <View style={styles.itemHeader}>
          <ThemedText style={styles.itemName}>{item.name}</ThemedText>
          <TouchableOpacity
            style={styles.restoreButton}
            onPress={() => handleRestore(item.id, 'slideshows', item.name)}
            disabled={isRestoring}
          >
            {isRestoring ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <MaterialIcons name="restore" size={18} color="#fff" />
                <ThemedText style={styles.restoreButtonText}>Restore</ThemedText>
              </>
            )}
          </TouchableOpacity>
        </View>
        {item.description && (
          <ThemedText style={styles.itemDescription}>{item.description}</ThemedText>
        )}
        <View style={styles.itemMeta}>
          <ThemedText style={styles.metaText}>Deleted: {daysAgo}</ThemedText>
          {daysUntilExpiry < 30 && (
            <ThemedText style={styles.warningText}>
              Expires in {daysUntilExpiry} days
            </ThemedText>
          )}
        </View>
      </View>
    );
  };

  const renderActivationCodeItem = (item: DeletedActivationCode) => {
    const daysAgo = formatDaysAgo(item.deleted_at);
    const daysUntilExpiry = getDaysUntilExpiry(item.deleted_at);
    const isRestoring = restoringIds.has(item.id);
    const contentName = item.playlist_name || item.slideshow_name || 'Unknown';
    
    return (
      <View key={item.id} style={styles.itemCard}>
        <View style={styles.itemHeader}>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.itemName}>{item.code}</ThemedText>
            <ThemedText style={styles.itemDescription}>
              {item.content_type === 'playlist' ? 'Playlist' : 'Slideshow'}: {contentName}
            </ThemedText>
          </View>
          <TouchableOpacity
            style={styles.restoreButton}
            onPress={() => handleRestore(item.id, 'activation-codes', item.code)}
            disabled={isRestoring}
          >
            {isRestoring ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <MaterialIcons name="restore" size={18} color="#fff" />
                <ThemedText style={styles.restoreButtonText}>Restore</ThemedText>
              </>
            )}
          </TouchableOpacity>
        </View>
        <View style={styles.itemMeta}>
          <ThemedText style={styles.metaText}>Deleted: {daysAgo}</ThemedText>
          {daysUntilExpiry < 30 && (
            <ThemedText style={styles.warningText}>
              Expires in {daysUntilExpiry} days
            </ThemedText>
          )}
        </View>
      </View>
    );
  };

  const renderContent = () => {
    if (loading) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" />
          <ThemedText style={styles.loadingText}>Loading deleted items...</ThemedText>
        </View>
      );
    }

    let items: (DeletedQRCode | DeletedPlaylist | DeletedSlideshow | DeletedActivationCode)[] = [];
    if (activeTab === 'qr-codes') {
      items = filterItems(deletedQRCodes);
    } else if (activeTab === 'playlists') {
      items = filterItems(deletedPlaylists);
    } else if (activeTab === 'slideshows') {
      items = filterItems(deletedSlideshows);
    } else if (activeTab === 'activation-codes') {
      items = filterItems(deletedActivationCodes);
    }

    if (items.length === 0) {
      return (
        <View style={styles.centerContainer}>
          <MaterialIcons name="delete-outline" size={64} color="#9ca3af" />
          <ThemedText style={styles.emptyText}>
            {searchQuery
              ? 'No deleted items match your search'
              : 'No deleted items found (last 90 days)'}
          </ThemedText>
        </View>
      );
    }

    const grouped = groupItemsByUser(items);

    return (
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {Object.entries(grouped).map(([userId, group]) => (
          <View key={userId} style={styles.userGroup}>
            <View style={styles.userHeader}>
              <View>
                <ThemedText style={styles.userName}>{group.owner_username || 'Unknown'}</ThemedText>
                <ThemedText style={styles.userEmail}>{group.owner_email}</ThemedText>
              </View>
              <View style={styles.countBadge}>
                <ThemedText style={styles.countText}>{group.items.length}</ThemedText>
              </View>
            </View>
            <View style={styles.itemsContainer}>
              {group.items.map((item) => {
                if (activeTab === 'qr-codes') {
                  return renderQRCodeItem(item as DeletedQRCode);
                } else if (activeTab === 'playlists') {
                  return renderPlaylistItem(item as DeletedPlaylist);
                } else if (activeTab === 'slideshows') {
                  return renderSlideshowItem(item as DeletedSlideshow);
                } else if (activeTab === 'activation-codes') {
                  return renderActivationCodeItem(item as DeletedActivationCode);
                }
                return null;
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialIcons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <ThemedText style={styles.title}>Restore Deleted Items</ThemedText>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'qr-codes' && styles.activeTab]}
          onPress={() => setActiveTab('qr-codes')}
        >
          <ThemedText
            style={[styles.tabText, activeTab === 'qr-codes' && styles.activeTabText]}
          >
            QR Codes ({deletedQRCodes.length})
          </ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'playlists' && styles.activeTab]}
          onPress={() => setActiveTab('playlists')}
        >
          <ThemedText
            style={[styles.tabText, activeTab === 'playlists' && styles.activeTabText]}
          >
            Playlists ({deletedPlaylists.length})
          </ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'slideshows' && styles.activeTab]}
          onPress={() => setActiveTab('slideshows')}
        >
          <ThemedText
            style={[styles.tabText, activeTab === 'slideshows' && styles.activeTabText]}
          >
            Slideshows ({deletedSlideshows.length})
          </ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'activation-codes' && styles.activeTab]}
          onPress={() => setActiveTab('activation-codes')}
        >
          <ThemedText
            style={[styles.tabText, activeTab === 'activation-codes' && styles.activeTabText]}
          >
            Activation Codes ({deletedActivationCodes.length})
          </ThemedText>
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <MaterialIcons name="search" size={20} color="#9ca3af" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or user..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor="#9ca3af"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <MaterialIcons name="clear" size={20} color="#9ca3af" />
          </TouchableOpacity>
        )}
      </View>

      {renderContent()}
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
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    marginRight: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#3b82f6',
  },
  tabText: {
    fontSize: 14,
    color: '#6b7280',
  },
  activeTabText: {
    color: '#3b82f6',
    fontWeight: '600',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#000',
  },
  scrollView: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 16,
    color: '#6b7280',
  },
  emptyText: {
    marginTop: 16,
    color: '#6b7280',
    textAlign: 'center',
  },
  userGroup: {
    marginBottom: 24,
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 8,
    overflow: 'hidden',
  },
  userHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f9fafb',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  userEmail: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
  countBadge: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  countText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  itemsContainer: {
    padding: 12,
  },
  itemCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    flex: 1,
    marginRight: 8,
  },
  restoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10b981',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  restoreButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  itemDescription: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8,
  },
  itemMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaText: {
    fontSize: 12,
    color: '#9ca3af',
  },
  warningText: {
    fontSize: 12,
    color: '#f59e0b',
    fontWeight: '600',
  },
});

