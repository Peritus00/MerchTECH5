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
import { useAuth } from '@/contexts/AuthContext';
import { MerchTechLogo } from '@/components/MerchTechLogo';
import { api } from '@/services/api';

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
  const { user } = useAuth();
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTimeframe, setSelectedTimeframe] = useState<'7d' | '30d' | '90d'>('7d');

  useEffect(() => {
    fetchDashboardData();
  }, [selectedTimeframe]);

  const fetchDashboardData = async () => {
    try {
      setIsLoading(true);
      
      // Fetch real analytics data
      const analytics = await analyticsService.getAnalyticsSummary();
      
      // Fetch user's actual content counts
      let userCounts = {
        totalQRCodes: 0,
        totalPlaylists: 0,
        totalSlideshows: 0,
        totalProducts: 0,
        activationCodes: 0,
      };

      if (user) {
        try {
          // Fetch real counts from API
          const [qrCodes, playlists, slideshows, products, activationCodes] = await Promise.all([
            api.get('/qr-codes'),
            api.get('/playlists'),
            api.get('/slideshows'),
            api.get('/products'),
            api.get('/activation-codes'),
          ]);

          userCounts = {
            totalQRCodes: qrCodes.data.qrCodes?.length || 0,
            totalPlaylists: playlists.data.playlists?.length || 0,
            totalSlideshows: slideshows.data.slideshows?.length || 0,
            totalProducts: products.data.products?.length || 0,
            activationCodes: activationCodes.data.activationCodes?.length || 0,
          };
        } catch (error) {
          console.error('Error fetching user content counts:', error);
        }
      }

      // Create recent activity from real data
      const recentActivity: Array<{
        id: number;
        type: 'scan' | 'playlist' | 'qrcode' | 'product' | 'achievement';
        description: string;
        timestamp: string;
        metadata?: any;
      }> = [];

      // Add recent scans from analytics
      if (analytics.recentScans && analytics.recentScans.length > 0) {
        analytics.recentScans.forEach((scan, index) => {
          recentActivity.push({
            id: index + 1,
            type: 'scan',
            description: `QR Code scanned: ${scan.qrName || 'Unknown QR Code'}`,
            timestamp: scan.timestamp,
            metadata: scan,
          });
        });
      }

      // If no real activity, show empty state
      if (recentActivity.length === 0) {
        recentActivity.push({
          id: 1,
          type: 'scan',
          description: 'No recent activity - create your first QR code to get started!',
          timestamp: new Date().toISOString(),
        });
      }

      setDashboardData({
        summary: {
          totalScans: analytics.totalScans || 0,
          scansToday: analytics.todayScans || 0,
          totalQRCodes: userCounts.totalQRCodes,
          totalPlaylists: userCounts.totalPlaylists,
          totalSlideshows: userCounts.totalSlideshows,
          totalProducts: userCounts.totalProducts,
          activationCodes: userCounts.activationCodes,
          revenue: 0, // Will be populated from real sales data when implemented
        },
        recentActivity,
        analytics: {
          scanHistory: analytics.hourlyData ? analytics.hourlyData.map((count, hour) => ({
            date: new Date(Date.now() - (23 - hour) * 60 * 60 * 1000).toISOString(),
            count: count || 0,
          })) : [],
          topQRCodes: [], // Will be populated from real QR code analytics
          deviceBreakdown: analytics.topDevices || [],
        },
        achievements: [], // Will be populated when achievement system is implemented
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      // Set empty state instead of mock data
      setDashboardData({
        summary: {
          totalScans: 0,
          scansToday: 0,
          totalQRCodes: 0,
          totalPlaylists: 0,
          totalSlideshows: 0,
          totalProducts: 0,
          activationCodes: 0,
          revenue: 0,
        },
        recentActivity: [{
          id: 1,
          type: 'scan',
          description: 'Unable to load activity data',
          timestamp: new Date().toISOString(),
        }],
        analytics: {
          scanHistory: [],
          topQRCodes: [],
          deviceBreakdown: [],
        },
        achievements: [],
      });
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
      <View style={[styles.container, styles.centered]}>
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
        {/* Profile Button - Top Right */}
        <TouchableOpacity 
          style={styles.profileButton}
          onPress={() => router.push('/settings/profile')}
        >
          <MaterialIcons name="account-circle" size={32} color="#6b7280" />
        </TouchableOpacity>
        
        {/* Centered Logo Section */}
        <View style={styles.logoSection}>
          <MerchTechLogo size="large" variant="full" />
        </View>
        
        {/* Welcome Text - Centered */}
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeText}>Welcome back, {user?.username || 'User'}!</Text>
          <Text style={styles.headerTitle}>Dashboard Overview</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Upgrade Section for Free/Basic Users */}
        {(user?.subscriptionTier === 'free' || user?.subscriptionTier === 'basic' || !user?.subscriptionTier) && (
          <View style={styles.upgradeContainer}>
            <View style={styles.upgradeCard}>
              <View style={styles.upgradeHeader}>
                <View style={styles.upgradeIconContainer}>
                  <MaterialIcons name="rocket-launch" size={32} color="#8b5cf6" />
                </View>
                <View style={styles.upgradeTextContainer}>
                  <Text style={styles.upgradeTitle}>
                    {user?.subscriptionTier === 'basic' ? 'Upgrade to Premium' : 'Unlock Premium Features'}
                  </Text>
                  <Text style={styles.upgradeSubtitle}>
                    {user?.subscriptionTier === 'basic' 
                      ? 'Get unlimited QR codes and advanced analytics'
                      : 'Create unlimited QR codes, access premium features & more'
                    }
                  </Text>
                </View>
              </View>
              
              <View style={styles.upgradeFeatures}>
                <View style={styles.featureRow}>
                  <MaterialIcons name="check-circle" size={16} color="#10b981" />
                  <Text style={styles.featureText}>Unlimited QR codes</Text>
                </View>
                <View style={styles.featureRow}>
                  <MaterialIcons name="check-circle" size={16} color="#10b981" />
                  <Text style={styles.featureText}>Advanced analytics & insights</Text>
                </View>
                <View style={styles.featureRow}>
                  <MaterialIcons name="check-circle" size={16} color="#10b981" />
                  <Text style={styles.featureText}>Premium templates & designs</Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.upgradeButton}
                onPress={() => router.push('/subscription')}
                activeOpacity={0.8}
              >
                <Text style={styles.upgradeButtonText}>
                  {user?.subscriptionTier === 'basic' ? 'Upgrade Now' : 'Start Free Trial'}
                </Text>
                <MaterialIcons name="arrow-forward" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        )}

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
    position: 'relative',
    paddingHorizontal: 16,
    paddingVertical: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    alignItems: 'center',
  },
  profileButton: {
    position: 'absolute',
    top: 20,
    right: 16,
    zIndex: 10,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: 12,
  },
  welcomeSection: {
    alignItems: 'center',
  },
  welcomeText: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 4,
    textAlign: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1f2937',
    textAlign: 'center',
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
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  upgradeContainer: {
    marginBottom: 24,
  },
  upgradeCard: {
    backgroundColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    backgroundColor: '#8b5cf6',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#8b5cf6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  upgradeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  upgradeIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  upgradeTextContainer: {
    flex: 1,
  },
  upgradeTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  upgradeSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    lineHeight: 20,
  },
  upgradeFeatures: {
    marginBottom: 20,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  featureText: {
    fontSize: 14,
    color: '#fff',
    marginLeft: 8,
    fontWeight: '500',
  },
  upgradeButton: {
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  upgradeButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#8b5cf6',
    marginRight: 8,
  },
  loginButton: {
    backgroundColor: '#3b82f6',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  loginButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
});