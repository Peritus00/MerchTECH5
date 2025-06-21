
import React from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import { ThemedText } from './ThemedText';
import { useColorScheme } from '@/hooks/useColorScheme';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}

const SearchBar: React.FC<SearchBarProps> = ({ value, onChangeText, placeholder }) => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#374151' : '#f3f4f6' }]}>
      <ThemedText style={styles.icon}>🔍</ThemedText>
      <TextInput
        style={[styles.input, { color: isDark ? '#fff' : '#1f2937' }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder || "Search..."}
        placeholderTextColor={isDark ? '#9ca3af' : '#6b7280'}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
  },
  icon: {
    fontSize: 20,
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
  },
});

export default SearchBar;
