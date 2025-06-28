import React from 'react';
import { StyleSheet } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';
import { TouchableOpacity } from 'react-native-gesture-handler';

export default function MasterSalesReports() {
  const handleDownloadCsv = () => {
    // TODO: fetch global sales CSV
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Master Sales Reports</ThemedText>
      <ThemedText style={styles.subtitle}>Download CSV reports for all products in the system.</ThemedText>
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
    backgroundColor: '#16a34a',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 6,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
}); 