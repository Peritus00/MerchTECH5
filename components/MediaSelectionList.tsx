
import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { MediaFile } from '@/shared/media-schema';

interface MediaSelectionListProps {
  mediaFiles: MediaFile[];
  selectedMediaIds: number[];
  onToggleSelection: (mediaId: number) => void;
}

const MediaSelectionList: React.FC<MediaSelectionListProps> = ({
  mediaFiles,
  selectedMediaIds,
  onToggleSelection,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'audio' | 'video'>('all');

  const filteredMediaFiles = mediaFiles.filter(file => {
    const matchesSearch = file.title.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (filterType === 'all') return matchesSearch;
    if (filterType === 'audio') {
      return (file.fileType === 'audio' || file.contentType?.startsWith('audio/')) && matchesSearch;
    }
    if (filterType === 'video') {
      return (file.fileType === 'video' || file.contentType?.startsWith('video/')) && matchesSearch;
    }
    
    return matchesSearch;
  });

  const getFileIcon = (file: MediaFile) => {
    if (file.fileType === 'audio' || file.contentType?.startsWith('audio/')) {
      return 'audiotrack';
    }
    if (file.fileType === 'video' || file.contentType?.startsWith('video/')) {
      return 'videocam';
    }
    return 'insert-drive-file';
  };

  const getFileTypeColor = (file: MediaFile) => {
    if (file.fileType === 'audio' || file.contentType?.startsWith('audio/')) {
      return '#8b5cf6';
    }
    if (file.fileType === 'video' || file.contentType?.startsWith('video/')) {
      return '#ef4444';
    }
    return '#6b7280';
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const renderMediaItem = ({ item }: { item: MediaFile }) => {
    const isSelected = selectedMediaIds.includes(item.id);
    
    return (
      <TouchableOpacity
        style={[styles.mediaItem, isSelected && styles.selectedItem]}
        onPress={() => onToggleSelection(item.id)}
        activeOpacity={0.7}
      >
        <View style={styles.mediaContent}>
          <View style={[styles.iconContainer, { backgroundColor: getFileTypeColor(item) + '20' }]}>
            <MaterialIcons
              name={getFileIcon(item)}
              size={20}
              color={getFileTypeColor(item)}
            />
          </View>
          <View style={styles.mediaInfo}>
            <Text style={styles.mediaTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <View style={styles.mediaMetadata}>
              <Text style={styles.fileType}>
                {item.contentType?.replace(/^(audio|video)\//, '').toUpperCase() || item.fileType.toUpperCase()}
              </Text>
              {item.filesize && (
                <>
                  <Text style={styles.separator}>•</Text>
                  <Text style={styles.fileSize}>
                    {formatFileSize(item.filesize)}
                  </Text>
                </>
              )}
            </View>
          </View>
          <View style={[styles.checkbox, isSelected && styles.checkedBox]}>
            {isSelected && (
              <MaterialIcons name="check" size={16} color="#fff" />
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Search and Filter */}
      <View style={styles.controls}>
        <View style={styles.searchContainer}>
          <MaterialIcons name="search" size={20} color="#6b7280" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search media files..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#9ca3af"
          />
        </View>
        <View style={styles.filterContainer}>
          {['all', 'audio', 'video'].map((type) => (
            <TouchableOpacity
              key={type}
              style={[
                styles.filterButton,
                filterType === type && styles.activeFilterButton,
              ]}
              onPress={() => setFilterType(type as any)}
            >
              <Text
                style={[
                  styles.filterText,
                  filterType === type && styles.activeFilterText,
                ]}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Media List */}
      <FlatList
        data={filteredMediaFiles}
        renderItem={renderMediaItem}
        keyExtractor={(item) => item.id.toString()}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialIcons name="musical-notes" size={48} color="#9ca3af" />
            <Text style={styles.emptyText}>No media files found</Text>
            <Text style={styles.emptySubtext}>
              {searchQuery ? 'Try adjusting your search' : 'Upload some media files first'}
            </Text>
          </View>
        }
      />

      {/* Selection Summary */}
      {selectedMediaIds.length > 0 && (
        <View style={styles.selectionSummary}>
          <Text style={styles.summaryText}>
            {selectedMediaIds.length} file{selectedMediaIds.length !== 1 ? 's' : ''} selected
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  controls: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#1f2937',
  },
  filterContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
  },
  activeFilterButton: {
    backgroundColor: '#3b82f6',
  },
  filterText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
  },
  activeFilterText: {
    color: '#fff',
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 16,
  },
  mediaItem: {
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedItem: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  mediaContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  mediaInfo: {
    flex: 1,
  },
  mediaTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  mediaMetadata: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fileType: {
    fontSize: 12,
    color: '#8b5cf6',
    fontWeight: '500',
  },
  separator: {
    fontSize: 12,
    color: '#9ca3af',
    marginHorizontal: 6,
  },
  fileSize: {
    fontSize: 12,
    color: '#6b7280',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#d1d5db',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkedBox: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 4,
    textAlign: 'center',
  },
  selectionSummary: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  summaryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default MediaSelectionList;
