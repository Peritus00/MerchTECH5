import React from 'react';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { StyleSheet } from 'react-native';

export default function EnhancedSalesReports() {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Enhanced Sales Reports</ThemedText>
      <ThemedText>View detailed sales analytics here.</ThemedText>
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