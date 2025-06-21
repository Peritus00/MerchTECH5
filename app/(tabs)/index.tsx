
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { analyticsService } from '@/services/analyticsService';
import { AnalyticsSummary } from '@/types';

interface DashboardData {
  summary: {
    totalScans: number;
    scansToday: number;
    totalQRCodes: number;
    totalPlaylists: number;
    totalSlideshows: number;
    totalProducts: number;
    activationCodes: number;
    revenue: number;
  };
  recentActivity: Array<{
    id: number;
    type: 'scan' | 'playlist' | 'qrcode' | 'product' | 'achievement';
    description: string;
    timestamp: string;
    metadata?: any;
  }>;
  analytics: {
    scanHistory: Array<{ date: string; count: number }>;
    topQRCodes: Array<{ name: string; scans: number }>;
    deviceBreakdown: Array<{ device: string; count: number }>;
  };
  achievements: Array<{
    id: number;
    name: string;
    description: string;
    isUnlocked: boolean;
    progress?: number;
  }>;
}

const { width } = Dimensions.get('window');

export default function DashboardScreen() {
  const router = useRouter();
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTimeframe, setSelectedTimeframe] = useState<'7d' | '30d' | '90d'>('7d');

  useEffect(() => {
    fetchDashboardData();
  }, [selectedTimeframe]);

  const fetchDashboardData = async () => {
    try {
      const data = await analyticsService.getAnalyticsSummary();
      
      // Mock recent activity - replace with actual API call
      const recentActivity = [
        {
          id: 1,
          type: 'scan' as const,
          description: 'QR Code scanned: My Playlist',
          timestamp: new Date().toISOString(),
        },
        {
          id: 2,
          type: 'playlist' as const,
          description: 'New playlist created: Summer Hits',
          timestamp: new Date(Date.now() - 3600000).toISOString(),
        },
      ];

      setDashboardData({
        summary: {
          totalScans: data.totalScans || 0,
          scansToday: data.todayScans || 0,
          totalQRCodes: 5, // Mock data
          totalPlaylists: 3, // Mock data
          totalSlideshows: 2, // Mock data
          totalProducts: 8, // Mock data
          activationCodes: 12, // Mock data
          revenue: 1250, // Mock data
        },
        recentActivity,
        analytics: {
          scanHistory: [
            { date: '2024-01-01', count: 10 },
            { date: '2024-01-02', count: 15 },
            { date: '2024-01-03', count: 8 },
            { date: '2024-01-04', count: 22 },
            { date: '2024-01-05', count: 18 },
            { date: '2024-01-06', count: 25 },
            { date: '2024-01-07', count: 30 },
          ],
          topQRCodes: data.topQRCodes || [],
          deviceBreakdown: data.topDevices || [],
        },
        achievements: [],
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  const quickActions = [
    {
      title: 'Create QR Code',
      icon: 'qr-code',
      color: '#3b82f6',
      onPress: () => router.push('/(tabs)/settings'),
    },
    {
      title: 'New Playlist',
      icon: 'queue-music',
      color: '#10b981',
      onPress: () => router.push('/(tabs)/playlists'),
    },
    {
      title: 'Add Slideshow',
      icon: 'photo-library',
      color: '#8b5cf6',
      onPress: () => router.push('/(tabs)/slideshows'),
    },
    {
      title: 'View Analytics',
      icon: 'analytics',
      color: '#f59e0b',
      onPress: () => router.push('/(tabs)/analytics'),
    },
  ];

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Loading dashboard...</Text>
      </View>
    );
  }

  if (!dashboardData) {
    return (
      <View style={styles.errorContainer}>
        <MaterialIcons name="error-outline" size={64} color="#ef4444" />
        <Text style={styles.errorText}>Failed to load dashboard</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchDashboardData}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const DashboardStatsCard = ({ title, value, icon, color, trend }: {
    title: string;
    value: number;
    icon: string;
    color: string;
    trend?: string;
  }) => {
    const cardWidth = (width - 48) / 2;
    
    const formatValue = (num: number) => {
      if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
      } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
      }
      return num.toString();
    };

    const isPositiveTrend = trend?.startsWith('+');

    return (
      <View style={[styles.statCard, { width: cardWidth }]}>
        <View style={styles.statHeader}>
          <View style={[styles.iconContainer, { backgroundColor: color + '20' }]}>
            <MaterialIcons name={icon as any} size={20} color={color} />
          </View>
          {trend && (
            <View style={[styles.trendContainer, isPositiveTrend ? styles.positiveTrend : styles.negativeTrend]}>
              <MaterialIcons
                name={isPositiveTrend ? "trending-up" : "trending-down"}
                size={12}
                color={isPositiveTrend ? "#10b981" : "#ef4444"}
              />
              <Text style={[styles.trendText, { color: isPositiveTrend ? "#10b981" : "#ef4444" }]}>
                {trend}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.statValue}>{formatValue(value)}</Text>
        <Text style={styles.statTitle}>{title}</Text>
      </View>
    );
  };

  const QuickActionCard = ({ title, icon, color, onPress }: {
    title: string;
    icon: string;
    color: string;
    onPress: () => void;
  }) => {
    const cardWidth = (width - 48) / 2;

    return (
      <TouchableOpacity
        style={[styles.actionCard, { width: cardWidth }]}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <MaterialIcons name={icon as any} size={32} color={color} />
        <Text style={styles.actionTitle}>{title}</Text>
      </TouchableOpacity>
    );
  };

  const RecentActivityCard = ({ activity }: {
    activity: {
      id: number;
      type: 'scan' | 'playlist' | 'qrcode' | 'product' | 'achievement';
      description: string;
      timestamp: string;
    };
  }) => {
    const getActivityIcon = (type: string) => {
      switch (type) {
        case 'scan': return 'visibility';
        case 'playlist': return 'queue-music';
        case 'qrcode': return 'qr-code';
        case 'product': return 'shopping-bag';
        case 'achievement': return 'star';
        default: return 'info';
      }
    };

    const getActivityColor = (type: string) => {
      switch (type) {
        case 'scan': return '#3b82f6';
        case 'playlist': return '#10b981';
        case 'qrcode': return '#8b5cf6';
        case 'product': return '#f59e0b';
        case 'achievement': return '#ef4444';
        default: return '#6b7280';
      }
    };

    const formatTimestamp = (timestamp: string) => {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffMinutes = Math.floor(diffMs / (1000 * 60));

      if (diffHours > 24) {
        return date.toLocaleDateString();
      } else if (diffHours > 0) {
        return `${diffHours}h ago`;
      } else if (diffMinutes > 0) {
        return `${diffMinutes}m ago`;
      } else {
        return 'Just now';
      }
    };

    const activityColor = getActivityColor(activity.type);

    return (
      <View style={styles.activityCard}>
        <View style={[styles.activityIconContainer, { backgroundColor: activityColor + '20' }]}>
          <MaterialIcons
            name={getActivityIcon(activity.type) as any}
            size={16}
            color={activityColor}
          />
        </View>
        <View style={styles.activityContent}>
          <Text style={styles.activityDescription} numberOfLines={2}>
            {activity.description}
          </Text>
          <Text style={styles.activityTimestamp}>
            {formatTimestamp(activity.timestamp)}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.welcomeText}>Welcome back!</Text>
          <Text style={styles.headerTitle}>Dashboard Overview</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/settings/profile')}>
          <MaterialIcons name="account-circle" size={32} color="#6b7280" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Summary Stats */}
        <View style={styles.statsContainer}>
          <Text style={styles.sectionTitle}>Overview</Text>
          <View style={styles.statsGrid}>
            <DashboardStatsCard
              title="Total Scans"
              value={dashboardData.summary.totalScans}
              icon="visibility"
              color="#3b82f6"
              trend="+12%"
            />
            <DashboardStatsCard
              title="Today's Scans"
              value={dashboardData.summary.scansToday}
              icon="today"
              color="#10b981"
              trend="+5%"
            />
            <DashboardStatsCard
              title="QR Codes"
              value={dashboardData.summary.totalQRCodes}
              icon="qr-code"
              color="#8b5cf6"
            />
            <DashboardStatsCard
              title="Playlists"
              value={dashboardData.summary.totalPlaylists}
              icon="queue-music"
              color="#f59e0b"
            />
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActionsContainer}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickActionsGrid}>
            {quickActions.map((action, index) => (
              <QuickActionCard
                key={index}
                title={action.title}
                icon={action.icon}
                color={action.color}
                onPress={action.onPress}
              />
            ))}
          </View>
        </View>

        {/* Recent Activity */}
        <View style={styles.activityContainer}>
          <View style={styles.activityHeader}>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/analytics')}>
              <Text style={styles.viewAllText}>View All</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.activityList}>
            {dashboardData.recentActivity.slice(0, 5).map((activity) => (
              <RecentActivityCard
                key={activity.id}
                activity={activity}
              />
            ))}
          </View>
        </View>

        {/* Content Summary */}
        <View style={styles.contentSummary}>
          <Text style={styles.sectionTitle}>Content Overview</Text>
          <View style={styles.contentGrid}>
            <View style={styles.contentCard}>
              <MaterialIcons name="photo-library" size={24} color="#8b5cf6" />
              <Text style={styles.contentValue}>{dashboardData.summary.totalSlideshows}</Text>
              <Text style={styles.contentLabel}>Slideshows</Text>
            </View>
            <View style={styles.contentCard}>
              <MaterialIcons name="shopping-bag" size={24} color="#f59e0b" />
              <Text style={styles.contentValue}>{dashboardData.summary.totalProducts}</Text>
              <Text style={styles.contentLabel}>Products</Text>
            </View>
            <View style={styles.contentCard}>
              <MaterialIcons name="vpn-key" size={24} color="#ef4444" />
              <Text style={styles.contentValue}>{dashboardData.summary.activationCodes}</Text>
              <Text style={styles.contentLabel}>Access Codes</Text>
            </View>
          </View>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  welcomeText: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 2,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
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
    backgroundColor: '#f8fafc',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6b7280',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 32,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ef4444',
    marginTop: 16,
    marginBottom: 24,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 16,
  },
  statsContainer: {
    marginBottom: 24,
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
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  trendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 12,
    gap: 2,
  },
  positiveTrend: {
    backgroundColor: '#d1fae5',
  },
  negativeTrend: {
    backgroundColor: '#fee2e2',
  },
  trendText: {
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
  quickActionsContainer: {
    marginBottom: 24,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    minHeight: 100,
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    textAlign: 'center',
    marginTop: 8,
  },
  activityContainer: {
    marginBottom: 24,
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  viewAllText: {
    fontSize: 14,
    color: '#3b82f6',
    fontWeight: '600',
  },
  activityList: {
    gap: 8,
  },
  activityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  activityIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  activityContent: {
    flex: 1,
  },
  activityDescription: {
    fontSize: 14,
    color: '#1f2937',
    marginBottom: 2,
    lineHeight: 18,
  },
  activityTimestamp: {
    fontSize: 12,
    color: '#9ca3af',
  },
  contentSummary: {
    marginBottom: 24,
  },
  contentGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  contentCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  contentValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 8,
    marginBottom: 4,
  },
  contentLabel: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
  },
});
