/**
 * ResponsiveDashboard Component
 * Improved dashboard with responsive design and better mobile scaling
 */

import React from 'react';
import { View, StyleSheet, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useResponsive } from '@/hooks/useResponsive';
import ResponsiveContainer from './ResponsiveContainer';
import ResponsiveText from './ResponsiveText';
import ResponsiveGrid from './ResponsiveGrid';
import ZoomControls from './ZoomControls';

interface DashboardStats {
  totalMedia: number;
  totalPlaylists: number;
  totalSlideshows: number;
  totalQRCodes: number;
  totalSales: number;
  totalRevenue: number;
}

interface ResponsiveDashboardProps {
  stats?: DashboardStats;
  isLoading?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
}

export const ResponsiveDashboard: React.FC<ResponsiveDashboardProps> = ({
  stats,
  isLoading = false,
  onRefresh,
  refreshing = false,
}) => {
  const router = useRouter();
  const { user } = useAuth();
  const { 
    isSmall, 
    isMedium, 
    isTablet, 
    padding, 
    fonts,
    getColumns,
    getCardWidth 
  } = useResponsive();

  const quickActions = [
    {
      title: 'Upload Media',
      icon: 'cloud-upload-outline',
      color: '#3b82f6',
      onPress: () => router.push('/(tabs)/media'),
    },
    {
      title: 'Create Playlist',
      icon: 'musical-notes-outline',
      color: '#10b981',
      onPress: () => router.push('/(tabs)/playlists'),
    },
    {
      title: 'New Slideshow',
      icon: 'images-outline',
      color: '#f59e0b',
      onPress: () => router.push('/(tabs)/slideshows'),
    },
    {
      title: 'Generate QR',
      icon: 'qr-code-outline',
      color: '#8b5cf6',
      onPress: () => router.push('/(tabs)/explore'),
    },
    {
      title: 'View Store',
      icon: 'storefront-outline',
      color: '#ef4444',
      onPress: () => router.push('/(tabs)/store'),
    },
    {
      title: 'Analytics',
      icon: 'bar-chart-outline',
      color: '#06b6d4',
      onPress: () => router.push('/(tabs)/analytics'),
    },
  ];

  const statCards = stats ? [
    { title: 'Media Files', value: stats.totalMedia, color: '#3b82f6', icon: 'play-circle' },
    { title: 'Playlists', value: stats.totalPlaylists, color: '#10b981', icon: 'musical-notes' },
    { title: 'Slideshows', value: stats.totalSlideshows, color: '#f59e0b', icon: 'images' },
    { title: 'QR Codes', value: stats.totalQRCodes, color: '#8b5cf6', icon: 'qr-code' },
    { title: 'Sales', value: stats.totalSales, color: '#ef4444', icon: 'receipt' },
    { title: 'Revenue', value: `$${stats.totalRevenue}`, color: '#06b6d4', icon: 'trending-up' },
  ] : [];

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      colors={['#3b82f6']}
      tintColor="#3b82f6"
    />
  );

  return (
    <ResponsiveContainer
      refreshControl={refreshControl}
      style={styles.container}
    >
      {/* Header */}
      <View style={[styles.header, { paddingBottom: padding.vertical }]}>
        <ResponsiveText variant="caption" color="#6b7280">
          Welcome back,
        </ResponsiveText>
        <ResponsiveText variant={isSmall ? 'h3' : 'h2'} weight="bold">
          {user?.username || 'User'}
        </ResponsiveText>
      </View>

      {/* Stats Grid */}
      {!isLoading && statCards.length > 0 && (
        <View style={[styles.section, { marginBottom: padding.vertical }]}>
          <ResponsiveText 
            variant={isSmall ? 'h4' : 'h3'} 
            weight="bold" 
            style={[styles.sectionTitle, { marginBottom: padding.vertical }]}
          >
            Overview
          </ResponsiveText>
          
          <ResponsiveGrid minItemWidth={isSmall ? 140 : 160} gap={padding.horizontal}>
            {statCards.map((stat, index) => (
              <StatCard key={index} {...stat} />
            ))}
          </ResponsiveGrid>
        </View>
      )}

      {/* Quick Actions */}
      <View style={styles.section}>
        <ResponsiveText 
          variant={isSmall ? 'h4' : 'h3'} 
          weight="bold" 
          style={[styles.sectionTitle, { marginBottom: padding.vertical }]}
        >
          Quick Actions
        </ResponsiveText>
        
        <ResponsiveGrid minItemWidth={isSmall ? 120 : 150} gap={padding.horizontal}>
          {quickActions.map((action, index) => (
            <ActionCard key={index} {...action} />
          ))}
        </ResponsiveGrid>
      </View>

      {/* Zoom Controls for small screens */}
      {isSmall && (
        <View style={styles.zoomContainer}>
          <ZoomControls
            onZoomChange={(zoom) => {
              // Could implement global zoom scaling here
              console.log('Zoom level changed to:', zoom);
            }}
          />
        </View>
      )}
    </ResponsiveContainer>
  );
};

// StatCard Component
const StatCard: React.FC<{
  title: string;
  value: number | string;
  color: string;
  icon: string;
}> = ({ title, value, color, icon }) => {
  const { padding, fonts, isSmall } = useResponsive();

  return (
    <View style={[styles.statCard, { padding: padding.vertical }]}>
      <View style={[styles.statIcon, { backgroundColor: `${color}20` }]}>
        <ResponsiveText variant="h3" color={color}>
          📊
        </ResponsiveText>
      </View>
      <ResponsiveText 
        variant={isSmall ? 'h4' : 'h3'} 
        weight="bold" 
        style={styles.statValue}
      >
        {value}
      </ResponsiveText>
      <ResponsiveText 
        variant="caption" 
        color="#6b7280"
        numberOfLines={1}
      >
        {title}
      </ResponsiveText>
    </View>
  );
};

// ActionCard Component
const ActionCard: React.FC<{
  title: string;
  icon: string;
  color: string;
  onPress: () => void;
}> = ({ title, icon, color, onPress }) => {
  const { padding, isSmall } = useResponsive();

  return (
    <View 
      style={[styles.actionCard, { padding: padding.vertical }]}
      onTouchEnd={onPress}
    >
      <View style={[styles.actionIcon, { backgroundColor: `${color}20` }]}>
        <ResponsiveText variant={isSmall ? 'h4' : 'h3'} color={color}>
          🔧
        </ResponsiveText>
      </View>
      <ResponsiveText 
        variant={isSmall ? 'caption' : 'body'} 
        weight="600"
        numberOfLines={2}
        style={styles.actionTitle}
      >
        {title}
      </ResponsiveText>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f8fafc',
  },
  header: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#1f2937',
  },
  statCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  statValue: {
    marginBottom: 4,
  },
  actionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionTitle: {
    textAlign: 'center',
  },
  zoomContainer: {
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 32,
  },
});

export default ResponsiveDashboard;
