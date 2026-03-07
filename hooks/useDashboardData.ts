/**
 * Cached dashboard data query - shows last synced data when offline.
 */
import { useOfflineQuery } from '@/hooks/useOfflineQuery';
import { analyticsService } from '@/services/analyticsService';
import { api } from '@/services/api';

export interface DashboardData {
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

const emptyDashboardData: DashboardData = {
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
    description: 'No recent activity - create your first QR code to get started!',
    timestamp: new Date().toISOString(),
  }],
  analytics: {
    scanHistory: [],
    topQRCodes: [],
    deviceBreakdown: [],
  },
  achievements: [],
};

async function fetchDashboardData(): Promise<DashboardData> {
  const [analytics, counts] = await Promise.all([
    analyticsService.getAnalyticsSummary(),
    api.get('/dashboard/counts').then((r) => r.data).catch(() => ({
      totalQRCodes: 0,
      totalPlaylists: 0,
      totalSlideshows: 0,
      totalProducts: 0,
      activationCodes: 0,
    })),
  ]);

  const userCounts = {
    totalQRCodes: counts.totalQRCodes ?? 0,
    totalPlaylists: counts.totalPlaylists ?? 0,
    totalSlideshows: counts.totalSlideshows ?? 0,
    totalProducts: counts.totalProducts ?? 0,
    activationCodes: counts.activationCodes ?? 0,
  };

  const recentActivity: DashboardData['recentActivity'] = [];

  if (analytics.recentScans && analytics.recentScans.length > 0) {
    analytics.recentScans.forEach((scan: any, index: number) => {
      recentActivity.push({
        id: index + 1,
        type: 'scan',
        description: `QR Code scanned: ${scan.qrName || 'Unknown QR Code'}`,
        timestamp: scan.timestamp,
        metadata: scan,
      });
    });
  }

  if (recentActivity.length === 0) {
    recentActivity.push({
      id: 1,
      type: 'scan',
      description: 'No recent activity - create your first QR code to get started!',
      timestamp: new Date().toISOString(),
    });
  }

  return {
    summary: {
      totalScans: analytics.totalScans || 0,
      scansToday: analytics.todayScans || 0,
      totalQRCodes: userCounts.totalQRCodes,
      totalPlaylists: userCounts.totalPlaylists,
      totalSlideshows: userCounts.totalSlideshows,
      totalProducts: userCounts.totalProducts,
      activationCodes: userCounts.activationCodes,
      revenue: 0,
    },
    recentActivity,
    analytics: {
      scanHistory: analytics.hourlyData ? analytics.hourlyData.map((count: number, hour: number) => ({
        date: new Date(Date.now() - (23 - hour) * 60 * 60 * 1000).toISOString(),
        count: count || 0,
      })) : [],
      topQRCodes: [],
      deviceBreakdown: analytics.topDevices || [],
    },
    achievements: [],
  };
}

export const dashboardQueryKey = ['dashboard'] as const;

export function useDashboardData(userId?: number | null) {
  return useOfflineQuery({
    queryKey: [...dashboardQueryKey, userId ?? 'anon'] as const,
    queryFn: fetchDashboardData,
    placeholderData: emptyDashboardData,
    enabled: userId != null,
  });
}
