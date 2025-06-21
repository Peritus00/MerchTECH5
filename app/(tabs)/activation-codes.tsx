
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
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Playlist, Slideshow, ActivationCode } from '@/shared/media-schema';
import ActivationCodeCard from '@/components/ActivationCodeCard';
import CreateCodeModal from '@/components/CreateCodeModal';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';

type ContentType = 'playlist' | 'slideshow';

const ActivationCodesScreen = () => {
  const navigation = useNavigation();
  const [contentType, setContentType] = useState<ContentType>('playlist');
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [slideshows, setSlideshows] = useState<Slideshow[]>([]);
  const [selectedContentId, setSelectedContentId] = useState<string | number | null>(null);
  const [activationCodes, setActivationCodes] = useState<ActivationCode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingCodes, setIsLoadingCodes] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchContent();
  }, [contentType]);

  useEffect(() => {
    if (selectedContentId) {
      fetchActivationCodes();
    } else {
      setActivationCodes([]);
    }
  }, [selectedContentId, contentType]);

  const fetchContent = async () => {
    try {
      setIsLoading(true);
      if (contentType === 'playlist') {
        // Mock data for playlists
        const mockPlaylists: Playlist[] = [
          {
            id: '1',
            name: 'Summer Vibes',
            description: 'Perfect tracks for summer',
            mediaFiles: [],
            requiresActivationCode: true,
            createdAt: new Date().toISOString(),
          },
          {
            id: '2',
            name: 'Workout Mix',
            description: 'High energy music',
            mediaFiles: [],
            requiresActivationCode: false,
            createdAt: new Date().toISOString(),
          },
        ];
        setPlaylists(mockPlaylists);
      } else {
        // Mock data for slideshows
        const mockSlideshows: Slideshow[] = [
          {
            id: 1,
            name: 'Product Showcase',
            description: 'Latest product images',
            uniqueId: 'slide1',
            autoplayInterval: 5000,
            transition: 'fade',
            requiresActivationCode: true,
            createdAt: new Date().toISOString(),
            images: [],
          },
        ];
        setSlideshows(mockSlideshows);
      }
    } catch (error) {
      console.error('Error fetching content:', error);
      Alert.alert('Error', `Failed to load ${contentType}s`);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const fetchActivationCodes = async () => {
    if (!selectedContentId) return;

    try {
      setIsLoadingCodes(true);
      // Mock activation codes data
      const mockCodes: ActivationCode[] = [
        {
          id: 1,
          code: 'ABC123',
          playlistId: selectedContentId.toString(),
          maxUses: 5,
          usesCount: 2,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          isActive: true,
          createdAt: new Date().toISOString(),
        },
        {
          id: 2,
          code: 'XYZ789',
          playlistId: selectedContentId.toString(),
          maxUses: null,
          usesCount: 10,
          expiresAt: null,
          isActive: false,
          createdAt: new Date().toISOString(),
        },
      ];
      setActivationCodes(mockCodes);
    } catch (error) {
      console.error('Error fetching activation codes:', error);
      Alert.alert('Error', 'Failed to load activation codes');
      setActivationCodes([]);
    } finally {
      setIsLoadingCodes(false);
    }
  };

  const handleCreateCode = async (codeData: {
    maxUses?: number | null;
    expiresAt?: Date | null;
  }) => {
    if (!selectedContentId) return;

    try {
      const newCode: ActivationCode = {
        id: Date.now(),
        code: Math.random().toString(36).substring(2, 8).toUpperCase(),
        playlistId: selectedContentId.toString(),
        maxUses: codeData.maxUses || null,
        usesCount: 0,
        expiresAt: codeData.expiresAt?.toISOString() || null,
        isActive: true,
        createdAt: new Date().toISOString(),
      };

      setActivationCodes(prev => [newCode, ...prev]);
      setShowCreateModal(false);
      Alert.alert('Success', 'Activation code created successfully');
    } catch (error) {
      console.error('Error creating activation code:', error);
      Alert.alert('Error', 'Failed to create activation code');
    }
  };

  const handleDeleteCode = async (codeId: number) => {
    Alert.alert(
      'Delete Activation Code',
      'Are you sure you want to delete this activation code?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            setActivationCodes(prev => prev.filter(code => code.id !== codeId));
            Alert.alert('Success', 'Activation code deleted');
          },
        },
      ]
    );
  };

  const handleToggleCodeStatus = async (codeId: number, isActive: boolean) => {
    try {
      setActivationCodes(prev =>
        prev.map(code => code.id === codeId ? { ...code, isActive } : code)
      );
    } catch (error) {
      console.error('Error updating activation code:', error);
      Alert.alert('Error', 'Failed to update activation code');
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchContent();
    if (selectedContentId) {
      fetchActivationCodes();
    }
  };

  const getSelectedContent = () => {
    if (contentType === 'playlist') {
      return playlists.find(p => p.id === selectedContentId);
    } else {
      return slideshows.find(s => s.id === selectedContentId);
    }
  };

  const filteredCodes = activationCodes.filter(code =>
    code.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeCodes = filteredCodes.filter(code => code.isActive);
  const inactiveCodes = filteredCodes.filter(code => !code.isActive);

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Access Codes</Text>
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
        {/* Content Type Selector */}
        <View style={styles.tabContainer}>
          {['playlist', 'slideshow'].map((type) => (
            <TouchableOpacity
              key={type}
              style={[
                styles.tab,
                contentType === type && styles.activeTab,
              ]}
              onPress={() => {
                setContentType(type as ContentType);
                setSelectedContentId(null);
                setActivationCodes([]);
              }}
            >
              <MaterialIcons
                name={type === 'playlist' ? 'queue-music' : 'slideshow'}
                size={20}
                color={contentType === type ? '#fff' : '#6b7280'}
              />
              <Text
                style={[
                  styles.tabText,
                  contentType === type && styles.activeTabText,
                ]}
              >
                {type === 'playlist' ? 'Playlists' : 'Slideshows'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Content Selector */}
        <View style={styles.contentSection}>
          <Text style={styles.sectionTitle}>
            Select {contentType === 'playlist' ? 'Playlist' : 'Slideshow'}
          </Text>

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#3b82f6" />
              <Text style={styles.loadingText}>Loading {contentType}s...</Text>
            </View>
          ) : (
            <View style={styles.contentGrid}>
              {(contentType === 'playlist' ? playlists : slideshows).map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.contentCard,
                    selectedContentId === item.id && styles.selectedCard,
                  ]}
                  onPress={() => setSelectedContentId(item.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.cardContent}>
                    <View style={[
                      styles.iconContainer,
                      selectedContentId === item.id && styles.selectedIconContainer,
                    ]}>
                      <MaterialIcons
                        name={contentType === 'playlist' ? 'queue-music' : 'slideshow'}
                        size={24}
                        color={selectedContentId === item.id ? '#fff' : '#3b82f6'}
                      />
                    </View>

                    <View style={styles.contentInfo}>
                      <Text style={[
                        styles.contentName,
                        selectedContentId === item.id && styles.selectedContentName,
                      ]} numberOfLines={2}>
                        {item.name}
                      </Text>

                      <Text style={[
                        styles.contentDetails,
                        selectedContentId === item.id && styles.selectedContentDetails,
                      ]}>
                        {contentType === 'playlist'
                          ? `${(item as Playlist).mediaFiles?.length || 0} files`
                          : `${(item as Slideshow).images?.length || 0} images`
                        }
                      </Text>
                    </View>

                    {selectedContentId === item.id && (
                      <MaterialIcons name="check-circle" size={20} color="#3b82f6" />
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Search Bar */}
        {selectedContentId && activationCodes.length > 0 && (
          <View style={styles.searchContainer}>
            <MaterialIcons name="search" size={20} color="#6b7280" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search activation codes..."
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

        {/* Activation Codes List */}
        {selectedContentId && (
          <View style={styles.codesSection}>
            {isLoadingCodes ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#3b82f6" />
                <Text style={styles.loadingText}>Loading activation codes...</Text>
              </View>
            ) : (
              <>
                {/* Active Codes */}
                {activeCodes.length > 0 && (
                  <View style={styles.codeGroup}>
                    <View style={styles.groupHeader}>
                      <Text style={styles.groupTitle}>
                        Active Codes ({activeCodes.length})
                      </Text>
                      <MaterialIcons name="check-circle" size={16} color="#10b981" />
                    </View>
                    {activeCodes.map((code) => (
                      <ActivationCodeCard
                        key={code.id}
                        code={code}
                        onDelete={() => handleDeleteCode(code.id)}
                        onToggleStatus={(isActive) => handleToggleCodeStatus(code.id, isActive)}
                      />
                    ))}
                  </View>
                )}

                {/* Inactive Codes */}
                {inactiveCodes.length > 0 && (
                  <View style={styles.codeGroup}>
                    <View style={styles.groupHeader}>
                      <Text style={styles.groupTitle}>
                        Inactive Codes ({inactiveCodes.length})
                      </Text>
                      <MaterialIcons name="cancel" size={16} color="#6b7280" />
                    </View>
                    {inactiveCodes.map((code) => (
                      <ActivationCodeCard
                        key={code.id}
                        code={code}
                        onDelete={() => handleDeleteCode(code.id)}
                        onToggleStatus={(isActive) => handleToggleCodeStatus(code.id, isActive)}
                      />
                    ))}
                  </View>
                )}

                {/* Empty State */}
                {filteredCodes.length === 0 && activationCodes.length === 0 && (
                  <View style={styles.emptyContainer}>
                    <MaterialIcons name="key" size={64} color="#9ca3af" />
                    <Text style={styles.emptyText}>No activation codes yet</Text>
                    <Text style={styles.emptySubtext}>
                      Create activation codes to control access to this {contentType}
                    </Text>
                  </View>
                )}

                {/* No Search Results */}
                {filteredCodes.length === 0 && activationCodes.length > 0 && (
                  <View style={styles.emptyContainer}>
                    <MaterialIcons name="search-off" size={64} color="#9ca3af" />
                    <Text style={styles.emptyText}>No codes found</Text>
                    <Text style={styles.emptySubtext}>
                      Try adjusting your search terms
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>
        )}

        {/* Instructions */}
        {!selectedContentId && !isLoading && (
          <View style={styles.instructionsContainer}>
            <MaterialIcons name="info" size={48} color="#3b82f6" />
            <Text style={styles.instructionsTitle}>Access Code Management</Text>
            <Text style={styles.instructionsText}>
              Select a {contentType} above to view and manage its activation codes.
              You can create individual codes or generate multiple codes at once.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Create Code Modal */}
      <CreateCodeModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreateCode={handleCreateCode}
        playlistName={getSelectedContent()?.name || ''}
      />
    </ThemedView>
  );
};

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
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  activeTab: {
    backgroundColor: '#3b82f6',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  activeTabText: {
    color: '#fff',
  },
  contentSection: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    gap: 12,
  },
  loadingText: {
    fontSize: 16,
    color: '#6b7280',
  },
  contentGrid: {
    gap: 12,
  },
  contentCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  selectedCard: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  selectedIconContainer: {
    backgroundColor: '#3b82f6',
  },
  contentInfo: {
    flex: 1,
  },
  contentName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  selectedContentName: {
    color: '#1e40af',
  },
  contentDetails: {
    fontSize: 14,
    color: '#6b7280',
  },
  selectedContentDetails: {
    color: '#3b82f6',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 16,
    gap: 8,
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
  codesSection: {
    gap: 16,
  },
  codeGroup: {
    marginBottom: 24,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  groupTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
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
  },
  instructionsContainer: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  instructionsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 16,
    marginBottom: 12,
  },
  instructionsText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 32,
  },
});

export default ActivationCodesScreen;
