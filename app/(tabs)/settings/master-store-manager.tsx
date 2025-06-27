import React from 'react';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { StyleSheet } from 'react-native';

export default function MasterStoreManager() {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Master Store Manager</ThemedText>
      <ThemedText>Manage all store products and settings here.</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
}); 