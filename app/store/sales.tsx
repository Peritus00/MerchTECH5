import React from 'react';
import { StyleSheet } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { TouchableOpacity } from 'react-native-gesture-handler';

export default function MySalesReports() {
  const handleDownloadCsv = () => {
    // TODO: hook to backend endpoint and download CSV
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">My Sales Reports</ThemedText>
      <ThemedText style={styles.subtitle}>View and download your store's sales data.</ThemedText>
      <TouchableOpacity style={styles.button} onPress={handleDownloadCsv}>
        <ThemedText style={styles.buttonText}>Download CSV</ThemedText>
      </TouchableOpacity>
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
  subtitle: {
    marginTop: 8,
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 6,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
}); 