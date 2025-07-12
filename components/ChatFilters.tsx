import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Ionicons } from '@expo/vector-icons';
import { universalChatAPI } from '@/services/api';

interface ChatFiltersProps {
  currentFilter: {
    filterType: 'all' | 'user_store' | 'category';
    userId?: string;
    category?: string;
  };
  onFilterChange: (filter: {
    filterType: 'all' | 'user_store' | 'category';
    userId?: string;
    category?: string;
  }) => void;
  currentUserId?: number;
  currentUsername?: string;
}

export default function ChatFilters({ 
  currentFilter, 
  onFilterChange, 
  currentUserId,
  currentUsername 
}: ChatFiltersProps) {
  const [categories, setCategories] = useState<string[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    loadCategories();
  }, []);

  // Refresh categories when filter is expanded
  useEffect(() => {
    if (isExpanded) {
      loadCategories();
    }
  }, [isExpanded]);

  const loadCategories = async () => {
    try {
      const response = await universalChatAPI.getCategories();
      setCategories(response.categories || []);
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  };

  const handleFilterSelect = (
    filterType: 'all' | 'user_store' | 'category',
    value?: string
  ) => {
    let newFilter: any = { filterType };
    
    if (filterType === 'user_store' && currentUserId) {
      newFilter.userId = String(currentUserId);
    } else if (filterType === 'category' && value) {
      newFilter.category = value;
    }
    
    onFilterChange(newFilter);
    setIsExpanded(false);
  };

  const getActiveFilterText = () => {
    if (currentFilter.filterType === 'user_store') {
      return `${currentUsername || 'My'} Store`;
    } else if (currentFilter.filterType === 'category') {
      return currentFilter.category || 'Category';
    }
    return 'All Messages';
  };

  return (
    <ThemedView style={styles.container}>
      {/* Filter Toggle Button */}
      <TouchableOpacity 
        style={styles.filterButton}
        onPress={() => setIsExpanded(!isExpanded)}
      >
        <Ionicons name="filter" size={16} color="#666" />
        <ThemedText style={styles.filterButtonText}>
          {getActiveFilterText()}
        </ThemedText>
        <Ionicons 
          name={isExpanded ? "chevron-up" : "chevron-down"} 
          size={16} 
          color="#666" 
        />
      </TouchableOpacity>

      {/* Expanded Filter Options */}
      {isExpanded && (
        <View style={styles.expandedFilters}>
          {/* Main Filter Types */}
          <View style={styles.filterSection}>
            <ThemedText style={styles.sectionTitle}>Filter by:</ThemedText>
            
            <TouchableOpacity
              style={[
                styles.filterOption,
                currentFilter.filterType === 'all' && styles.activeFilter
              ]}
              onPress={() => handleFilterSelect('all')}
            >
              <Ionicons name="globe-outline" size={16} color="#666" />
              <ThemedText style={styles.filterOptionText}>All Messages</ThemedText>
            </TouchableOpacity>

            {currentUserId && (
              <TouchableOpacity
                style={[
                  styles.filterOption,
                  currentFilter.filterType === 'user_store' && styles.activeFilter
                ]}
                onPress={() => handleFilterSelect('user_store')}
              >
                <Ionicons name="storefront-outline" size={16} color="#666" />
                <ThemedText style={styles.filterOptionText}>
                  {currentUsername || 'My'} Store
                </ThemedText>
              </TouchableOpacity>
            )}

            <View style={styles.categorySection}>
              <TouchableOpacity
                style={[
                  styles.filterOption,
                  currentFilter.filterType === 'category' && styles.activeFilter
                ]}
                onPress={() => handleFilterSelect('category')}
              >
                <Ionicons name="pricetag-outline" size={16} color="#666" />
                <ThemedText style={styles.filterOptionText}>By Category</ThemedText>
              </TouchableOpacity>

              {currentFilter.filterType === 'category' && (
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  style={styles.categoryScroll}
                >
                  <TouchableOpacity
                    style={[
                      styles.categoryChip,
                      !currentFilter.category && styles.activeCategoryChip
                    ]}
                    onPress={() => handleFilterSelect('category')}
                  >
                    <ThemedText style={[
                      styles.categoryChipText,
                      !currentFilter.category && styles.activeCategoryChipText
                    ]}>
                      All
                    </ThemedText>
                  </TouchableOpacity>
                  {categories.map((category) => (
                    <TouchableOpacity
                      key={category}
                      style={[
                        styles.categoryChip,
                        currentFilter.category === category && styles.activeCategoryChip
                      ]}
                      onPress={() => handleFilterSelect('category', category)}
                    >
                      <ThemedText style={[
                        styles.categoryChipText,
                        currentFilter.category === category && styles.activeCategoryChipText
                      ]}>
                        {category}
                      </ThemedText>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          </View>
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f8f9fa',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  filterButtonText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  expandedFilters: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  filterSection: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  filterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginBottom: 4,
    gap: 8,
  },
  activeFilter: {
    backgroundColor: '#e0f2fe',
  },
  filterOptionText: {
    fontSize: 14,
    color: '#374151',
  },
  categorySection: {
    marginTop: 4,
  },
  categoryScroll: {
    marginTop: 8,
  },
  categoryChip: {
    backgroundColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
  },
  activeCategoryChip: {
    backgroundColor: '#3b82f6',
  },
  categoryChipText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '500',
  },
  activeCategoryChipText: {
    color: 'white',
  },
}); 