
import React, { useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  RefreshControl,
  Alert,
  Dimensions,
} from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { analyticsService } from '@/services/analyticsService';
import { AnalyticsSummary } from '@/types';

const { width } = Dimensions.get('window');

export default function AnalyticsScreen() {
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | '1y'>('30d');

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
  }, [timeRange]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchAnalytics();
  };

  if (loading && !analytics) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Loading analytics...</ThemedText>
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
        <ThemedText type="title">Analytics Dashboard</ThemedText>
        <ThemedText type="subtitle">Scan Performance & Insights</ThemedText>
      </ThemedView>

      {/* Time Range Selector */}
      <ThemedView style={styles.timeRangeContainer}>
        {(['7d', '30d', '90d', '1y'] as const).map((range) => (
          <View
            key={range}
            style={[
              styles.timeRangeButton,
              timeRange === range && styles.timeRangeButtonActive,
            ]}
          >
            <ThemedText
              style={[
                styles.timeRangeText,
                timeRange === range && styles.timeRangeTextActive,
              ]}
              onPress={() => setTimeRange(range)}
            >
              {range === '7d' ? '7 Days' : 
               range === '30d' ? '30 Days' : 
               range === '90d' ? '90 Days' : '1 Year'}
            </ThemedText>
          </View>
        ))}
      </ThemedView>

      {/* Key Metrics */}
      <ThemedView style={styles.metricsGrid}>
        <View style={styles.metricCard}>
          <ThemedText type="defaultSemiBold" style={styles.metricNumber}>
            {analytics?.totalScans || 0}
          </ThemedText>
          <ThemedText style={styles.metricLabel}>Total Scans</ThemedText>
          <ThemedText style={styles.metricChange}>
            +{analytics?.scanGrowth || 0}% vs last period
          </ThemedText>
        </View>

        <View style={styles.metricCard}>
          <ThemedText type="defaultSemiBold" style={styles.metricNumber}>
            {analytics?.uniqueVisitors || 0}
          </ThemedText>
          <ThemedText style={styles.metricLabel}>Unique Visitors</ThemedText>
          <ThemedText style={styles.metricChange}>
            +{analytics?.visitorGrowth || 0}% vs last period
          </ThemedText>
        </View>

        <View style={styles.metricCard}>
          <ThemedText type="defaultSemiBold" style={styles.metricNumber}>
            {analytics?.avgScansPerDay || 0}
          </ThemedText>
          <ThemedText style={styles.metricLabel}>Avg. Daily Scans</ThemedText>
          <ThemedText style={styles.metricChange}>
            +{analytics?.dailyGrowth || 0}% vs last period
          </ThemedText>
        </View>

        <View style={styles.metricCard}>
          <ThemedText type="defaultSemiBold" style={styles.metricNumber}>
            {analytics?.conversionRate || 0}%
          </ThemedText>
          <ThemedText style={styles.metricLabel}>Conversion Rate</ThemedText>
          <ThemedText style={styles.metricChange}>
            +{analytics?.conversionGrowth || 0}% vs last period
          </ThemedText>
        </View>
      </ThemedView>

      {/* Geographic Distribution */}
      <ThemedView style={styles.section}>
        <ThemedText type="subtitle" style={styles.sectionTitle}>
          Geographic Distribution
        </ThemedText>
        {analytics?.topCountries?.map((country, index) => (
          <View key={index} style={styles.listItem}>
            <View style={styles.countryInfo}>
              <ThemedText style={styles.countryFlag}>{country.flag || '🌍'}</ThemedText>
              <ThemedText>{country.country}</ThemedText>
            </View>
            <View style={styles.countryStats}>
              <ThemedText type="defaultSemiBold">{country.count}</ThemedText>
              <ThemedText style={styles.percentage}>
                {((country.count / (analytics?.totalScans || 1)) * 100).toFixed(1)}%
              </ThemedText>
            </View>
          </View>
        ))}
      </ThemedView>

      {/* Device Analytics */}
      <ThemedView style={styles.section}>
        <ThemedText type="subtitle" style={styles.sectionTitle}>
          Device Breakdown
        </ThemedText>
        {analytics?.topDevices?.map((device, index) => (
          <View key={index} style={styles.listItem}>
            <View style={styles.deviceInfo}>
              <ThemedText style={styles.deviceIcon}>
                {device.device.toLowerCase().includes('iphone') ? '📱' :
                 device.device.toLowerCase().includes('android') ? '🤖' :
                 device.device.toLowerCase().includes('desktop') ? '💻' : '📱'}
              </ThemedText>
              <ThemedText>{device.device}</ThemedText>
            </View>
            <View style={styles.deviceStats}>
              <ThemedText type="defaultSemiBold">{device.count}</ThemedText>
              <ThemedText style={styles.percentage}>
                {((device.count / (analytics?.totalScans || 1)) * 100).toFixed(1)}%
              </ThemedText>
            </View>
          </View>
        ))}
      </ThemedView>

      {/* Peak Hours */}
      <ThemedView style={styles.section}>
        <ThemedText type="subtitle" style={styles.sectionTitle}>
          Peak Activity Hours
        </ThemedText>
        <View style={styles.hourlyChart}>
          {[...Array(24)].map((_, hour) => {
            const scans = analytics?.hourlyData?.[hour] || 0;
            const maxScans = Math.max(...(analytics?.hourlyData || [1]));
            const height = (scans / maxScans) * 60;
            
            return (
              <View key={hour} style={styles.hourBar}>
                <View style={[styles.bar, { height: height || 2 }]} />
                <ThemedText style={styles.hourLabel}>
                  {hour.toString().padStart(2, '0')}
                </ThemedText>
              </View>
            );
          })}
        </View>
      </ThemedView>

      {/* Recent Activity */}
      <ThemedView style={styles.section}>
        <ThemedText type="subtitle" style={styles.sectionTitle}>
          Recent Scan Activity
        </ThemedText>
        {analytics?.recentScans?.map((scan, index) => (
          <View key={index} style={styles.scanItem}>
            <View style={styles.scanInfo}>
              <ThemedText type="defaultSemiBold">{scan.qrName}</ThemedText>
              <ThemedText style={styles.scanDetails}>
                {scan.location} • {scan.device}
              </ThemedText>
            </View>
            <ThemedText style={styles.scanTime}>
              {new Date(scan.timestamp).toLocaleTimeString()}
            </ThemedText>
          </View>
        ))}
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
  },
  timeRangeContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  timeRangeButton: {
    flex: 1,
    paddingVertical: 8,
    marginHorizontal: 2,
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
    alignItems: 'center',
  },
  timeRangeButtonActive: {
    backgroundColor: '#007BFF',
  },
  timeRangeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  timeRangeTextActive: {
    color: '#fff',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 12,
  },
  metricCard: {
    width: (width - 44) / 2,
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  metricNumber: {
    fontSize: 24,
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: 12,
    opacity: 0.7,
    marginBottom: 4,
  },
  metricChange: {
    fontSize: 10,
    color: '#22c55e',
  },
  section: {
    backgroundColor: '#fff',
    margin: 16,
    marginTop: 0,
    padding: 16,
    borderRadius: 12,
  },
  sectionTitle: {
    marginBottom: 16,
  },
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  countryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  countryFlag: {
    marginRight: 8,
    fontSize: 16,
  },
  countryStats: {
    alignItems: 'flex-end',
  },
  percentage: {
    fontSize: 12,
    opacity: 0.7,
  },
  deviceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  deviceIcon: {
    marginRight: 8,
    fontSize: 16,
  },
  deviceStats: {
    alignItems: 'flex-end',
  },
  hourlyChart: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 80,
    paddingHorizontal: 4,
  },
  hourBar: {
    alignItems: 'center',
    flex: 1,
  },
  bar: {
    width: 6,
    backgroundColor: '#007BFF',
    borderRadius: 3,
    marginBottom: 4,
  },
  hourLabel: {
    fontSize: 8,
    opacity: 0.7,
  },
  scanItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  scanInfo: {
    flex: 1,
  },
  scanDetails: {
    fontSize: 12,
    opacity: 0.7,
    marginTop: 2,
  },
  scanTime: {
    fontSize: 12,
    opacity: 0.7,
  },
});
