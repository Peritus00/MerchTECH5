import { Image } from 'expo-image';
import { Platform, StyleSheet } from 'react-native';

import { Collapsible } from '@/components/Collapsible';
import { ExternalLink } from '@/components/ExternalLink';
import ParallaxScrollView from '@/components/ParallaxScrollView';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { IconSymbol } from '@/components/ui/IconSymbol';

import React, { useState, useEffect, useRef } from 'react';
import { ScrollView, RefreshControl, View, TouchableOpacity, Alert, TextInput } from 'react-native';
import { AdvancedQRCodeGenerator } from '@/components/AdvancedQRCodeGenerator';
import { AdvancedQREditor } from '@/components/AdvancedQREditor';
import { qrCodeService } from '@/services/qrCodeService';
import { downloadAdvancedQRCode, QRCodeFormat } from '@/services/qrUtils';
import { captureRef } from 'react-native-view-shot';
import { MaterialIcons } from '@expo/vector-icons';
import { QRCode } from '@/types';
import { screensaverService } from '@/services/screensaverService';

const getContentTypeIcon = (contentType?: string) => {
  switch (contentType) {
    case 'url': return 'link';
    case 'email': return 'email';
    case 'phone': return 'phone';
    case 'text': return 'text-fields';
    case 'playlist': return 'library-music';
    case 'slideshow': return 'slideshow';
    case 'store': return 'store';
    default: return 'qr-code';
  }
};

const getContentTypeName = (contentType?: string) => {
  switch (contentType) {
    case 'url': return 'Website';
    case 'email': return 'Email';
    case 'phone': return 'Phone';
    case 'text': return 'Text';
    case 'playlist': return 'Playlist';
    case 'slideshow': return 'Slideshow';
    case 'store': return 'Store';
    default: return 'QR Code';
  }
};

const formatCreationDate = (dateString?: string) => {
  if (!dateString) {
    return 'Unknown';
  }
  
  try {
    // Handle different date formats that might come from the backend
    let date: Date;
    
    // If it's already a valid date string, parse it
    if (dateString.includes('T') || dateString.includes('-')) {
      date = new Date(dateString);
    } else {
      // If it's a timestamp, convert it
      const timestamp = parseInt(dateString);
      if (!isNaN(timestamp)) {
        date = new Date(timestamp);
      } else {
        date = new Date(dateString);
      }
    }
    
    // Check if the date is valid
    if (isNaN(date.getTime())) {
      return 'Invalid Date';
    }
    
    // Format as MM/DD/YYYY
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  } catch (error) {
    console.error('Error formatting date:', error, 'Original date string:', dateString);
    return 'Unknown';
  }
};

export default function QRCodesScreen() {
  const [qrCodes, setQrCodes] = useState<QRCode[]>([]);
  const [filteredQrCodes, setFilteredQrCodes] = useState<QRCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'type'>('date');
  
  // Download functionality
  const [downloadDropdownVisible, setDownloadDropdownVisible] = useState<{[key: number]: boolean}>({});
  const [downloadLoading, setDownloadLoading] = useState<{[key: number]: boolean}>({});
  const qrRefs = useRef<{[key: number]: any}>({});

  // Screensaver functionality
  const [currentScreensaverQRCode, setCurrentScreensaverQRCode] = useState<number | null>(null);
  const [screensaverLoading, setScreensaverLoading] = useState<{[key: number]: boolean}>({});
  const [isRestoringScreensaver, setIsRestoringScreensaver] = useState(false);

  const fetchQRCodes = async () => {
    try {
      const codes = await qrCodeService.getQRCodes();
      console.log('🔍 DEBUG: Fetched QR codes:', codes);
      console.log('🔍 DEBUG: First QR code structure:', codes[0]);
      if (codes[0]) {
        console.log('🔍 DEBUG: First QR code createdAt:', codes[0].createdAt);
        console.log('🔍 DEBUG: First QR code createdAt type:', typeof codes[0].createdAt);
        console.log('🔍 DEBUG: First QR code created_at:', codes[0].created_at);
        console.log('🔍 DEBUG: All keys in first QR code:', Object.keys(codes[0]));
      }
      setQrCodes(codes);
      applyFiltersAndSort(codes, searchQuery, sortBy);
    } catch (error) {
      console.error('Error fetching QR codes:', error);
      Alert.alert('Error', 'Failed to load QR codes');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const applyFiltersAndSort = (codes: QRCode[], query: string, sortOption: 'name' | 'date' | 'type') => {
    let filtered = codes;

    // Apply search filter
    if (query.trim()) {
      filtered = codes.filter(qr => 
        qr.name.toLowerCase().includes(query.toLowerCase()) ||
        qr.url.toLowerCase().includes(query.toLowerCase()) ||
        (qr.description && qr.description.toLowerCase().includes(query.toLowerCase()))
      );
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      switch (sortOption) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'date':
          const aDate = new Date(a.createdAt || a.created_at).getTime();
          const bDate = new Date(b.createdAt || b.created_at).getTime();
          return bDate - aDate;
        case 'type':
          return (a.contentType || 'url').localeCompare(b.contentType || 'url');
        default:
          return 0;
      }
    });

    setFilteredQrCodes(sorted);
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    applyFiltersAndSort(qrCodes, query, sortBy);
  };

  const handleSort = (sortOption: 'name' | 'date' | 'type') => {
    setSortBy(sortOption);
    applyFiltersAndSort(qrCodes, searchQuery, sortOption);
  };

  // Check screensaver state on component mount
  const checkScreensaverState = async () => {
    try {
      const state = await screensaverService.getScreensaverState();
      setCurrentScreensaverQRCode(state.currentQRCodeId);
    } catch (error) {
      console.error('Error checking screensaver state:', error);
    }
  };

  useEffect(() => {
    fetchQRCodes();
    checkScreensaverState();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchQRCodes();
    checkScreensaverState();
  };

  const handleDeleteQR = async (id: number) => {
    Alert.alert(
      'Delete QR Code',
      'Are you sure you want to delete this QR code?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await qrCodeService.deleteQRCode(id);
              const updatedQrCodes = qrCodes.filter(qr => qr.id !== id);
              setQrCodes(updatedQrCodes);
              applyFiltersAndSort(updatedQrCodes, searchQuery, sortBy);
            } catch (error) {
              Alert.alert('Error', 'Failed to delete QR code');
            }
          },
        },
      ]
    );
  };

  // Screensaver functions
  const handleSetAsScreensaver = async (qrCode: QRCode) => {
    console.log('🖼️ Setting QR code as screensaver:', qrCode.name);
    
    const qrRef = qrRefs.current[qrCode.id];
    if (!qrRef) {
      Alert.alert('Error', 'QR code not ready. Please try again.');
      return;
    }

    setScreensaverLoading(prev => ({ ...prev, [qrCode.id]: true }));

    try {
      const success = await screensaverService.setQRCodeAsScreensaver(qrRef, qrCode.id, qrCode.name);
      
      if (success) {
        setCurrentScreensaverQRCode(qrCode.id);
        Alert.alert(
          'Screensaver Set! 🎉',
          `"${qrCode.name}" is now ready to be set as your screensaver. Follow the instructions to complete the setup.`,
          [{ text: 'Great!', style: 'default' }]
        );
      }
    } catch (error) {
      console.error('Error setting screensaver:', error);
      Alert.alert('Error', 'Failed to set QR code as screensaver');
    } finally {
      setScreensaverLoading(prev => ({ ...prev, [qrCode.id]: false }));
    }
  };

  const handleRestoreOriginalScreensaver = async () => {
    console.log('🔄 Restoring original screensaver');
    
    setIsRestoringScreensaver(true);

    try {
      const success = await screensaverService.restoreOriginalScreensaver();
      
      if (success) {
        setCurrentScreensaverQRCode(null);
        Alert.alert(
          'Screensaver Restored! 🔄',
          'Follow the instructions to restore your original wallpaper.',
          [{ text: 'Got it!', style: 'default' }]
        );
      }
    } catch (error) {
      console.error('Error restoring screensaver:', error);
      Alert.alert('Error', 'Failed to restore original screensaver');
    } finally {
      setIsRestoringScreensaver(false);
    }
  };

  const toggleDownloadDropdown = (qrCodeId: number) => {
    setDownloadDropdownVisible(prev => ({
      ...prev,
      [qrCodeId]: !prev[qrCodeId]
    }));
  };

  const handleDownload = async (qrCode: QRCode, format: QRCodeFormat) => {
    console.log('🔽 Download initiated for:', { qrCodeId: qrCode.id, format });
    console.log('🔽 QR Code details:', { name: qrCode.name, url: qrCode.url });
    
    const qrRef = qrRefs.current[qrCode.id];
    console.log('📍 QR Ref found:', !!qrRef, 'Ref details:', qrRef);
    
    if (!qrRef) {
      console.error('❌ QR ref is null or undefined');
      Alert.alert('Error', 'QR code not ready for download');
      return;
    }

    setDownloadLoading(prev => ({ ...prev, [qrCode.id]: true }));
    setDownloadDropdownVisible(prev => ({ ...prev, [qrCode.id]: false }));

    try {
      console.log('⏳ Waiting for component to render...');
      // Wait a bit to ensure the component is fully rendered
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const qrData = {
        name: qrCode.name,
        content: qrCode.url,
        options: qrCode.options || {},
      };
      
      console.log('📦 QR Data prepared:', qrData);
      console.log('🚀 Calling downloadAdvancedQRCode...');
      
      await downloadAdvancedQRCode(qrRef, qrData, format);
      
      console.log('✅ Download function completed');
    } catch (error) {
      console.error('❌ Download error:', error);
      Alert.alert('Error', `Failed to download QR code: ${error.message || 'Unknown error'}`);
    } finally {
      setDownloadLoading(prev => ({ ...prev, [qrCode.id]: false }));
    }
  };

  if (loading && qrCodes.length === 0) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Loading QR codes...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <ThemedView style={styles.header}>
        <View style={styles.titleRow}>
          <ThemedText type="title">My QR Codes</ThemedText>
          <TouchableOpacity 
            style={styles.createButton}
            onPress={() => setCreateModalVisible(true)}
          >
            <ThemedText style={styles.createButtonText}>+ Create New</ThemedText>
          </TouchableOpacity>
        </View>

        {/* Active Screensaver Banner */}
        {currentScreensaverQRCode && (
          <View style={styles.screensaverBanner}>
            <View style={styles.screensaverBannerContent}>
              <MaterialIcons name="wallpaper" size={20} color="#10b981" />
              <ThemedText style={styles.screensaverBannerText}>
                QR Code is set as screensaver
              </ThemedText>
            </View>
            <TouchableOpacity
              style={[styles.restoreButton, isRestoringScreensaver && styles.disabledButton]}
              onPress={handleRestoreOriginalScreensaver}
              disabled={isRestoringScreensaver}
            >
              {isRestoringScreensaver ? (
                <MaterialIcons name="hourglass-empty" size={18} color="#fff" />
              ) : (
                <MaterialIcons name="restore" size={18} color="#fff" />
              )}
              <ThemedText style={styles.restoreButtonText}>
                {isRestoringScreensaver ? 'Restoring...' : 'Restore Original'}
              </ThemedText>
            </TouchableOpacity>
          </View>
        )}
        
        {/* Search and Sort Controls */}
        <View style={styles.controlsRow}>
          <View style={styles.searchContainer}>
            <MaterialIcons name="search" size={20} color="#6b7280" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search QR codes..."
              placeholderTextColor="#9ca3af"
              value={searchQuery}
              onChangeText={handleSearch}
            />
          </View>
          
          <View style={styles.sortContainer}>
            <MaterialIcons name="sort" size={20} color="#6b7280" />
            <TouchableOpacity
              style={[styles.sortButton, sortBy === 'name' && styles.activeSortButton]}
              onPress={() => handleSort('name')}
            >
              <ThemedText style={[styles.sortButtonText, sortBy === 'name' && styles.activeSortButtonText]}>
                Name
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sortButton, sortBy === 'date' && styles.activeSortButton]}
              onPress={() => handleSort('date')}
            >
              <ThemedText style={[styles.sortButtonText, sortBy === 'date' && styles.activeSortButtonText]}>
                Date
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sortButton, sortBy === 'type' && styles.activeSortButton]}
              onPress={() => handleSort('type')}
            >
              <ThemedText style={[styles.sortButtonText, sortBy === 'type' && styles.activeSortButtonText]}>
                Type
              </ThemedText>
            </TouchableOpacity>
          </View>
        </View>
        
        {/* Results Count */}
        {qrCodes.length > 0 && (
          <View style={styles.resultsCount}>
            <ThemedText style={styles.resultsCountText}>
              {filteredQrCodes.length} of {qrCodes.length} QR codes
              {searchQuery ? ` matching "${searchQuery}"` : ''}
            </ThemedText>
          </View>
        )}
      </ThemedView>

      {qrCodes.length === 0 ? (
        <ThemedView style={styles.emptyState}>
          <ThemedText type="subtitle">No QR codes yet</ThemedText>
          <ThemedText>Create your first QR code to get started</ThemedText>
        </ThemedView>
      ) : filteredQrCodes.length === 0 ? (
        <ThemedView style={styles.emptyState}>
          <MaterialIcons name="search-off" size={48} color="#9ca3af" />
          <ThemedText type="subtitle">No QR codes found</ThemedText>
          <ThemedText>Try adjusting your search or filters</ThemedText>
        </ThemedView>
      ) : (
        filteredQrCodes.map((qrCode) => (
          <ThemedView key={qrCode.id} style={styles.qrCodeCard}>
            <View style={styles.qrCodeHeader}>
              <View style={styles.qrCodeInfo}>
                <View style={styles.qrCodeNameRow}>
                  <ThemedText type="title" style={styles.qrCodeName}>{qrCode.name}</ThemedText>
                  <View style={styles.qrCodeTypeTag}>
                    <MaterialIcons 
                      name={getContentTypeIcon(qrCode.contentType)} 
                      size={12} 
                      color="#2563eb" 
                    />
                    <ThemedText style={styles.qrCodeTypeText}>
                      {getContentTypeName(qrCode.contentType)}
                    </ThemedText>
                  </View>
                </View>
                <ThemedText style={styles.qrCodeUrl} numberOfLines={2} ellipsizeMode="middle">
                  {qrCode.url}
                </ThemedText>
                {qrCode.description && (
                  <ThemedText style={styles.qrCodeDescription} numberOfLines={2}>
                    {qrCode.description}
                  </ThemedText>
                )}
                <View style={styles.qrCodeMetaRow}>
                  <ThemedText style={styles.qrCodeDate}>
                    Created: {formatCreationDate(qrCode.createdAt || qrCode.created_at)}
                  </ThemedText>
                  <ThemedText style={styles.qrCodeScans}>
                    Scans: {qrCode.scanCount || 0}
                  </ThemedText>
                </View>
              </View>
              
              <View style={styles.actionButtons}>
                {/* Download Button */}
                <View style={styles.downloadContainer}>
                  <TouchableOpacity
                    style={[styles.downloadButton, downloadLoading[qrCode.id] && styles.disabledButton]}
                    onPress={() => toggleDownloadDropdown(qrCode.id)}
                    disabled={downloadLoading[qrCode.id]}
                  >
                    <MaterialIcons 
                      name="file-download" 
                      size={20} 
                      color="#2563eb" 
                    />
                    <ThemedText style={styles.downloadButtonText}>
                      {downloadLoading[qrCode.id] ? 'Downloading...' : 'Download'}
                    </ThemedText>
                    <MaterialIcons 
                      name={downloadDropdownVisible[qrCode.id] ? "expand-less" : "expand-more"} 
                      size={20} 
                      color="#2563eb" 
                    />
                  </TouchableOpacity>

                  {downloadDropdownVisible[qrCode.id] && (
                    <View style={styles.downloadDropdown}>
                      <TouchableOpacity 
                        style={styles.downloadOption}
                        onPress={() => {
                          console.log('🖼️ PNG button pressed for QR:', qrCode.id);
                          handleDownload(qrCode, QRCodeFormat.PNG);
                        }}
                        activeOpacity={0.7}
                      >
                        <MaterialIcons name="image" size={18} color="#059669" />
                        <View style={styles.downloadOptionTextContainer}>
                          <ThemedText style={styles.downloadOptionText}>PNG</ThemedText>
                          <ThemedText style={styles.downloadOptionDesc}>High quality image</ThemedText>
                        </View>
                      </TouchableOpacity>

                      <TouchableOpacity 
                        style={[styles.downloadOption, { backgroundColor: 'transparent' }]}
                        onPress={() => {
                          console.log('🎨 SVG button pressed for QR:', qrCode.id);
                          handleDownload(qrCode, QRCodeFormat.SVG);
                        }}
                        activeOpacity={0.7}
                        delayPressIn={0}
                      >
                        <MaterialIcons name="code" size={18} color="#7c3aed" />
                        <View style={styles.downloadOptionTextContainer}>
                          <ThemedText style={styles.downloadOptionText}>SVG</ThemedText>
                          <ThemedText style={styles.downloadOptionDesc}>Vector format</ThemedText>
                        </View>
                      </TouchableOpacity>

                      <TouchableOpacity 
                        style={[styles.downloadOption, { backgroundColor: 'transparent', borderBottomWidth: 0 }]}
                        onPress={() => {
                          console.log('📄 PDF button pressed for QR:', qrCode.id);
                          handleDownload(qrCode, QRCodeFormat.PDF);
                        }}
                        activeOpacity={0.7}
                        delayPressIn={0}
                      >
                        <MaterialIcons name="picture-as-pdf" size={18} color="#dc2626" />
                        <View style={styles.downloadOptionTextContainer}>
                          <ThemedText style={styles.downloadOptionText}>PDF</ThemedText>
                          <ThemedText style={styles.downloadOptionDesc}>Document format</ThemedText>
                        </View>
                      </TouchableOpacity>

                    </View>
                  )}
                </View>

                {/* Screensaver Button */}
                <TouchableOpacity
                  style={[
                    styles.screensaverButton,
                    currentScreensaverQRCode === qrCode.id && styles.activeScreensaverButton,
                    screensaverLoading[qrCode.id] && styles.disabledButton
                  ]}
                  onPress={() => handleSetAsScreensaver(qrCode)}
                  disabled={screensaverLoading[qrCode.id]}
                >
                  {screensaverLoading[qrCode.id] ? (
                    <MaterialIcons name="hourglass-empty" size={16} color="#fff" />
                  ) : currentScreensaverQRCode === qrCode.id ? (
                    <MaterialIcons name="wallpaper" size={16} color="#fff" />
                  ) : (
                    <MaterialIcons name="wallpaper" size={16} color="#10b981" />
                  )}
                  <ThemedText style={[
                    styles.screensaverButtonText,
                    currentScreensaverQRCode === qrCode.id && styles.activeScreensaverButtonText
                  ]}>
                    {screensaverLoading[qrCode.id] 
                      ? 'Setting...' 
                      : currentScreensaverQRCode === qrCode.id 
                        ? 'Active' 
                        : 'Set as Screensaver'
                    }
                  </ThemedText>
                </TouchableOpacity>

                {/* Delete Button */}
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => handleDeleteQR(qrCode.id)}
                >
                  <ThemedText style={styles.deleteButtonText}>Delete</ThemedText>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.qrCodePreview}>
              <View 
                ref={(ref) => { qrRefs.current[qrCode.id] = ref; }}
                style={[styles.qrWrapper, { backgroundColor: '#FFFFFF' }]}
                collapsable={false}
              >
                <AdvancedQRCodeGenerator
                  value={qrCode.url}
                  size={150}
                  fgColor={qrCode.options?.foregroundColor || '#000000'}
                  bgColor={qrCode.options?.backgroundColor || '#FFFFFF'}
                  level={qrCode.options?.errorCorrectionLevel || 'H'}
                  cornerRadius={qrCode.options?.cornerRadius || 0}
                  gradientColors={qrCode.options?.gradientColors}
                  logoOptions={qrCode.options?.logo}
                />
              </View>
            </View>
          </ThemedView>
        ))
      )}

      <AdvancedQREditor
        visible={createModalVisible}
        onClose={() => setCreateModalVisible(false)}
        onQRCreated={() => {
          setCreateModalVisible(false);
          fetchQRCodes();
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  headerImage: {
    color: '#808080',
    bottom: -90,
    left: -35,
    position: 'absolute',
  },
  titleContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  container: {
    flex: 1,
    padding: 20,
  },
  header: {
    marginBottom: 20,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  controlsRow: {
    flexDirection: 'column',
    gap: 12,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#1f2937',
  },
  sortContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sortButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#f3f4f6',
  },
  activeSortButton: {
    backgroundColor: '#2563eb',
  },
  sortButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  activeSortButtonText: {
    color: '#ffffff',
  },
  resultsCount: {
    marginTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  resultsCountText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
  },
  createButton: {
    backgroundColor: '#007BFF',
    padding: 10,
    borderRadius: 5,
  },
  createButtonText: {
    color: 'white',
  },
  qrCodeCard: {
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  qrCodeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 15,
  },
  qrCodeInfo: {
    flex: 1,
    marginRight: 10,
  },
  qrCodeNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  qrCodeName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
    flex: 1,
    marginRight: 8,
  },
  qrCodeTypeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dbeafe',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  qrCodeTypeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#2563eb',
    textTransform: 'uppercase',
  },
  qrCodeUrl: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 4,
    lineHeight: 18,
  },
  qrCodeDescription: {
    fontSize: 12,
    color: '#9ca3af',
    fontStyle: 'italic',
    marginBottom: 6,
    lineHeight: 16,
  },
  qrCodeMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  qrCodeDate: {
    fontSize: 11,
    color: '#9ca3af',
  },
  qrCodeScans: {
    fontSize: 11,
    color: '#10b981',
    fontWeight: '600',
  },
  actionButtons: {
    flexDirection: 'column',
    gap: 8,
    alignItems: 'flex-end',
  },
  downloadContainer: {
    position: 'relative',
    zIndex: 1000,
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563eb',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    gap: 4,
  },
  disabledButton: {
    opacity: 0.5,
  },
  downloadButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  downloadDropdown: {
    position: 'absolute',
    top: 40,
    right: 0,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 1001,
    minWidth: 160,
    pointerEvents: 'auto',
  },
  downloadOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    gap: 12,
  },
  downloadOptionTextContainer: {
    flex: 1,
  },
  downloadOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  downloadOptionDesc: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  deleteButton: {
    backgroundColor: '#DC3545',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  deleteButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  qrCodePreview: {
    alignItems: 'center',
    marginTop: 10,
  },
  qrWrapper: {
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    padding: 10,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 12,
  },
  screensaverBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#dbeafe',
    borderRadius: 8,
    marginBottom: 10,
  },
  screensaverBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  screensaverBannerText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  restoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#2563eb',
    gap: 4,
    marginLeft: 'auto',
  },
  restoreButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  screensaverButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#10b981',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    gap: 4,
  },
  activeScreensaverButton: {
    backgroundColor: '#10b981',
    borderColor: '#10b981',
  },
  screensaverButtonText: {
    color: '#10b981',
    fontSize: 12,
    fontWeight: '600',
  },
  activeScreensaverButtonText: {
    color: 'white',
  },
});