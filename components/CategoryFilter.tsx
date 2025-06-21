
import React from 'react';
import { View, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';

interface CategoryFilterProps {
  categories: string[];
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
}

const CategoryFilter: React.FC<CategoryFilterProps> = ({
  categories,
  selectedCategory,
  onSelectCategory,
}) => {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {categories.map((category) => (
        <TouchableOpacity
          key={category}
          style={[
            styles.categoryButton,
            selectedCategory === category && styles.categoryButtonSelected,
          ]}
          onPress={() => onSelectCategory(category)}
        >
          <ThemedText
            style={[
              styles.categoryText,
              selectedCategory === category && styles.categoryTextSelected,
            ]}
          >
            {category}
          </ThemedText>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 0,
    gap: 8,
  },
  categoryButton: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  categoryButtonSelected: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  categoryText: {
    fontSize: 14,
    opacity: 0.7,
    fontWeight: '500',
  },
  categoryTextSelected: {
    color: '#fff',
    opacity: 1,
  },
});

export default CategoryFilter;
