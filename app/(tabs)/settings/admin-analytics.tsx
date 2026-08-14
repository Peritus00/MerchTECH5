import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LineChart, BarChart } from 'react-native-chart-kit';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/contexts/AuthContext';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { adminAPI } from '@/services/api';
import { AdminUserStats, AdminUserHistory } from '@/types';

const { width: screenWidth } = Dimensions.get('window');

const StatCard = ({ title, value, icon, color, change }: {
  title: string;
  value: number;
  icon: string;
  color: string;
  change?: { value: number; type: 'increase' | 'decrease' };
}) => {
  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };

  return (
    <View style={[styles.statCard, { width: '48%' }]}>
      <View style={styles.statHeader}>
        <View style={[styles.iconContainer, { backgroundColor: color + '20' }]}>
          <MaterialIcons name={icon as any} size={24} color={color} />
        </View>
        {change && (
          <View style={[
            styles.changeContainer,
            { backgroundColor: change.type === 'increase' ? '#dcfce7' : '#fef2f2' }
          ]}>
            <MaterialIcons
              name={change.type === 'increase' ? 'trending-up' : 'trending-down'}
              size={12}
              color={change.type === 'increase' ? '#16a34a' : '#dc2626'}
            />
            <Text style={[
              styles.changeText,
              { color: change.type === 'increase' ? '#16a34a' : '#dc2626' }
            ]}>
              {Math.abs(change.value)}%
            </Text>
          </View>
        )}
      </View>
      <Text style={styles.statValue}>{formatNumber(value)}</Text>
      <Text style={styles.statTitle}>{title}</Text>
    </View>
  );
};

const TimeRangeSelector = ({ selectedRange, onRangeChange }: {
  selectedRange: 'daily' | 'weekly' | 'monthly';
  onRangeChange: (range: 'daily' | 'weekly' | 'monthly') => void;
}) => {
  const timeRanges = [
    { value: 'daily' as const, label: 'Daily' },
    { value: 'weekly' as const, label: 'Weekly' },
    { value: 'monthly' as const, label: 'Monthly' },
  ];

  return (
    <View style={styles.timeContainer}>
      <Text style={styles.timeLabel}>Time Range</Text>
      <View style={styles.selector}>
        {timeRanges.map((range) => (
          <TouchableOpacity
            key={range.value}
            style={[
              styles.option,
              selectedRange === range.value && styles.selectedOption,
            ]}
            onPress={() => onRangeChange(range.value)}
          >
            <Text
              style={[
                styles.optionText,
                selectedRange === range.value && styles.selectedOptionText,
              ]}
            >
              {range.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

const ChartContainer = ({ title, children, subtitle }: {
  title: string;
  children: React.ReactNode;
  subtitle?: string;
}) => {
  return (
    <View style={styles.chartContainer}>
      <View style={styles.chartHeader}>
        <Text style={styles.chartTitle}>{title}</Text>
        {subtitle && <Text style={styles.chartSubtitle}>{subtitle}</Text>}
      </View>
      <View style={styles.chartContent}>
        {children}
      </View>
    </View>
  );
};

export default function AdminAnalyticsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isAdmin = useIsAdmin();
  const [stats, setStats] = useState<AdminUserStats | null>(null);
  const [history, setHistory] = useState<AdminUserHistory | null>(null);
  const [selectedTimeframe, setSelectedTimeframe] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!isAdmin) {
      router.replace('/(tabs)/settings');
      return;
    }
    fetchData();
  }, [selectedTimeframe, isAdmin]);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [statsData, historyData] = await Promise.all([
        adminAPI.getUserStats(),
        adminAPI.getUserHistory(selectedTimeframe),
      ]);
      setStats(statsData);
      setHistory(historyData);
    } catch (error: any) {
      console.error('Error fetching admin analytics:', error);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleTimeframeChange = (timeframe: 'daily' | 'weekly' | 'monthly') => {
    setSelectedTimeframe(timeframe);
  };

  if (!isAdmin) {
    return null;
  }

  if (isLoading && !stats) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>Loading admin analytics...</Text>
        </View>
      </ThemedView>
    );
  }

  // Prepare chart data
  const prepareChartData = (data: Array<{ date: string; count: number }>) => {
    if (!data || data.length === 0) {
      return {
        labels: [],
        datasets: [{ data: [] }],
      };
    }

    const labels = data.map(item => {
      const date = new Date(item.date);
      if (selectedTimeframe === 'daily') {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      } else if (selectedTimeframe === 'weekly') {
        // Calculate week number
        const oneJan = new Date(date.getFullYear(), 0, 1);
        const numberOfDays = Math.floor((date.getTime() - oneJan.getTime()) / (24 * 60 * 60 * 1000));
        const weekNumber = Math.ceil((numberOfDays + oneJan.getDay() + 1) / 7);
        return `Week ${weekNumber}`;
      } else {
        return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      }
    });

    const values = data.map(item => item.count);

    return {
      labels: labels.length > 10 ? labels.filter((_, i) => i % Math.ceil(labels.length / 10) === 0) : labels,
      datasets: [{ data: values }],
    };
  };

  const signedInChartData = history ? prepareChartData(history.signedInUsers) : { labels: [], datasets: [{ data: [] }] };
  const anonymousChartData = history ? prepareChartData(history.anonymousUsers) : { labels: [], datasets: [{ data: [] }] };
  const activeUsersChartData = history ? prepareChartData(history.activeUsers) : { labels: [], datasets: [{ data: [] }] };
  const activeAnonymousChartData = history ? prepareChartData(history.activeAnonymousUsers) : { labels: [], datasets: [{ data: [] }] };

  return (
    <ThemedView style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.push('/(tabs)/settings')}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialIcons name="arrow-back" size={24} color="#1f2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Admin User Analytics</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Current Stats */}
        {stats && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Current Statistics</Text>
            <View style={styles.statsGrid}>
              <StatCard
                title="Total Signed-In Users"
                value={stats.totalSignedInUsers}
                icon="people"
                color="#3b82f6"
              />
              <StatCard
                title="Total Anonymous Users"
                value={stats.totalAnonymousUsers}
                icon="person-outline"
                color="#8b5cf6"
              />
              <StatCard
                title="Active Users (7d)"
                value={stats.activeUsers7d}
                icon="trending-up"
                color="#10b981"
              />
              <StatCard
                title="Active Users (30d)"
                value={stats.activeUsers30d}
                icon="trending-up"
                color="#10b981"
              />
              <StatCard
                title="Active Anonymous (7d)"
                value={stats.activeAnonymous7d}
                icon="people-outline"
                color="#f59e0b"
              />
              <StatCard
                title="Active Anonymous (30d)"
                value={stats.activeAnonymous30d}
                icon="people-outline"
                color="#f59e0b"
              />
            </View>
          </View>
        )}

        {/* Activity Breakdown */}
        {stats && stats.activityBreakdown && stats.activityBreakdown.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Activity Breakdown (Last 30 Days)</Text>
            <View style={styles.activityList}>
              {stats.activityBreakdown.map((activity, index) => (
                <View key={index} style={styles.activityItem}>
                  <View style={styles.activityInfo}>
                    <Text style={styles.activityType}>
                      {activity.activityType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </Text>
                    <Text style={styles.activityCount}>{activity.count.toLocaleString()} users</Text>
                  </View>
                  <View style={[styles.activityBar, { width: `${Math.min((activity.count / (stats.totalSignedInUsers + stats.totalAnonymousUsers)) * 100, 100)}%` }]} />
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Time Range Selector */}
        <View style={styles.section}>
          <TimeRangeSelector
            selectedRange={selectedTimeframe}
            onRangeChange={handleTimeframeChange}
          />
        </View>

        {/* Historical Trends */}
        {history && (
          <>
            {/* Signed-In Users Trend */}
            <ChartContainer title="Signed-In Users Over Time" subtitle={`${selectedTimeframe.charAt(0).toUpperCase() + selectedTimeframe.slice(1)} view`}>
              {signedInChartData.labels.length > 0 ? (
                <LineChart
                  data={signedInChartData}
                  width={screenWidth - 48}
                  height={220}
                  chartConfig={{
                    backgroundColor: '#fff',
                    backgroundGradientFrom: '#fff',
                    backgroundGradientTo: '#fff',
                    decimalPlaces: 0,
                    color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
                    labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                    style: {
                      borderRadius: 16,
                    },
                  }}
                  style={{
                    borderRadius: 16,
                  }}
                  yAxisLabel=""
                  yAxisSuffix=""
                  fromZero
                />
              ) : (
                <View style={styles.emptyState}>
                  <MaterialIcons name="bar-chart" size={64} color="#d1d5db" />
                  <Text style={styles.emptyText}>No data available</Text>
                </View>
              )}
            </ChartContainer>

            {/* Anonymous Users Trend */}
            <ChartContainer title="Anonymous Users Over Time" subtitle={`${selectedTimeframe.charAt(0).toUpperCase() + selectedTimeframe.slice(1)} view`}>
              {anonymousChartData.labels.length > 0 ? (
                <LineChart
                  data={anonymousChartData}
                  width={screenWidth - 48}
                  height={220}
                  chartConfig={{
                    backgroundColor: '#fff',
                    backgroundGradientFrom: '#fff',
                    backgroundGradientTo: '#fff',
                    decimalPlaces: 0,
                    color: (opacity = 1) => `rgba(139, 92, 246, ${opacity})`,
                    labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                    style: {
                      borderRadius: 16,
                    },
                  }}
                  style={{
                    borderRadius: 16,
                  }}
                  yAxisLabel=""
                  yAxisSuffix=""
                  fromZero
                />
              ) : (
                <View style={styles.emptyState}>
                  <MaterialIcons name="bar-chart" size={64} color="#d1d5db" />
                  <Text style={styles.emptyText}>No data available</Text>
                </View>
              )}
            </ChartContainer>

            {/* Active Users Trend */}
            <ChartContainer title="Active Users Over Time" subtitle={`${selectedTimeframe.charAt(0).toUpperCase() + selectedTimeframe.slice(1)} view`}>
              {activeUsersChartData.labels.length > 0 ? (
                <BarChart
                  data={activeUsersChartData}
                  width={screenWidth - 48}
                  height={220}
                  chartConfig={{
                    backgroundColor: '#fff',
                    backgroundGradientFrom: '#fff',
                    backgroundGradientTo: '#fff',
                    decimalPlaces: 0,
                    color: (opacity = 1) => `rgba(16, 185, 129, ${opacity})`,
                    labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                    style: {
                      borderRadius: 16,
                    },
                  }}
                  style={{
                    borderRadius: 16,
                  }}
                  yAxisLabel=""
                  yAxisSuffix=""
                  fromZero
                />
              ) : (
                <View style={styles.emptyState}>
                  <MaterialIcons name="bar-chart" size={64} color="#d1d5db" />
                  <Text style={styles.emptyText}>No data available</Text>
                </View>
              )}
            </ChartContainer>

            {/* Active Anonymous Users Trend */}
            <ChartContainer title="Active Anonymous Users Over Time" subtitle={`${selectedTimeframe.charAt(0).toUpperCase() + selectedTimeframe.slice(1)} view`}>
              {activeAnonymousChartData.labels.length > 0 ? (
                <BarChart
                  data={activeAnonymousChartData}
                  width={screenWidth - 48}
                  height={220}
                  chartConfig={{
                    backgroundColor: '#fff',
                    backgroundGradientFrom: '#fff',
                    backgroundGradientTo: '#fff',
                    decimalPlaces: 0,
                    color: (opacity = 1) => `rgba(245, 158, 11, ${opacity})`,
                    labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                    style: {
                      borderRadius: 16,
                    },
                  }}
                  style={{
                    borderRadius: 16,
                  }}
                  yAxisLabel=""
                  yAxisSuffix=""
                  fromZero
                />
              ) : (
                <View style={styles.emptyState}>
                  <MaterialIcons name="bar-chart" size={64} color="#d1d5db" />
                  <Text style={styles.emptyText}>No data available</Text>
                </View>
              )}
            </ChartContainer>
          </>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  placeholder: {
    width: 32,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6b7280',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  changeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 12,
    gap: 2,
  },
  changeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4,
  },
  statTitle: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
  },
  activityList: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  activityItem: {
    marginBottom: 16,
  },
  activityInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  activityType: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  activityCount: {
    fontSize: 14,
    color: '#6b7280',
  },
  activityBar: {
    height: 8,
    backgroundColor: '#3b82f6',
    borderRadius: 4,
  },
  timeContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  timeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12,
  },
  selector: {
    flexDirection: 'row',
    gap: 8,
  },
  option: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
  },
  selectedOption: {
    backgroundColor: '#3b82f6',
  },
  optionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
  },
  selectedOptionText: {
    color: '#fff',
  },
  chartContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  chartHeader: {
    marginBottom: 16,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  chartSubtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  chartContent: {
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 14,
    color: '#9ca3af',
  },
});

