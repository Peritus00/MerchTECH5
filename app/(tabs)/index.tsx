import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, RefreshControl, Alert } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { analyticsService } from '@/services/analyticsService';
import { AnalyticsSummary } from '@/types';

export default function DashboardScreen() {
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAnalytics = async () => {
    try {
      const data = await analyticsService.getAnalyticsSummary();
      setAnalytics(data);
    } catch (error) {
      console.error('Error fetching analytics:', error);
      Alert.alert('Error', 'Failed to load analytics data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchAnalytics();
  };

  if (loading && !analytics) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Loading dashboard...</ThemedText>
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
        <ThemedText type="title">MerchTech Dashboard</ThemedText>
        <ThemedText type="subtitle">QR Code Analytics</ThemedText>
      </ThemedView>

      <ThemedView style={styles.statsGrid}>
        <View style={styles.statCard}>
          <ThemedText type="defaultSemiBold" style={styles.statNumber}>
            {analytics?.totalScans || 0}
          </ThemedText>
          <ThemedText style={styles.statLabel}>Total Scans</ThemedText>
        </View>

        <View style={styles.statCard}>
          <ThemedText type="defaultSemiBold" style={styles.statNumber}>
            {analytics?.todayScans || 0}
          </ThemedText>
          <ThemedText style={styles.statLabel}>Today</ThemedText>
        </View>

        <View style={styles.statCard}>
          <ThemedText type="defaultSemiBold" style={styles.statNumber}>
            {analytics?.weekScans || 0}
          </ThemedText>
          <ThemedText style={styles.statLabel}>This Week</ThemedText>
        </View>

        <View style={styles.statCard}>
          <ThemedText type="defaultSemiBold" style={styles.statNumber}>
            {analytics?.monthScans || 0}
          </ThemedText>
          <ThemedText style={styles.statLabel}>This Month</ThemedText>
        </View>
      </ThemedView>

      <ThemedView style={styles.section}>
        <ThemedText type="subtitle">Top Countries</ThemedText>
        {analytics?.topCountries?.map((country, index) => (
          <View key={index} style={styles.listItem}>
            <ThemedText>{country.country}</ThemedText>
            <ThemedText type="defaultSemiBold">{country.count}</ThemedText>
          </View>
        ))}
      </ThemedView>

      <ThemedView style={styles.section}>
        <ThemedText type="subtitle">Top Devices</ThemedText>
        {analytics?.topDevices?.map((device, index) => (
          <View key={index} style={styles.listItem}>
            <ThemedText>{device.device}</ThemedText>
            <ThemedText type="defaultSemiBold">{device.count}</ThemedText>
          </View>
        ))}
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    marginBottom: 24,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  statCard: {
    width: '48%',
    backgroundColor: '#f0f0f0',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    opacity: 0.7,
  },
  section: {
    marginBottom: 24,
  },
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
});