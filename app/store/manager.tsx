import React from 'react';
import { StyleSheet } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';

export default function MyStoreManager() {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">My Store Manager</ThemedText>
      <ThemedText>
        Here you will be able to edit your own products (price, sizes, stock). Implementation coming soon.
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
}); 