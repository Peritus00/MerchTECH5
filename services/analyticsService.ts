import { AnalyticsSummary, ScanData } from '../types';
import { api } from './api';

export const analyticsService = {
  // Get analytics summary from real data
  async getAnalyticsSummary(): Promise<AnalyticsSummary> {
    try {
      // Fetch real analytics data from server
      const response = await api.get('/analytics/summary');
      return response.data;
    } catch (error) {
      console.error('Error fetching analytics summary:', error);
      // Return empty/zero state instead of mock data
      return {
        totalScans: 0,
        todayScans: 0,
        weekScans: 0,
        monthScans: 0,
        uniqueVisitors: 0,
        avgScansPerDay: 0,
        conversionRate: 0,
        scanGrowth: 0,
        visitorGrowth: 0,
        dailyGrowth: 0,
        conversionGrowth: 0,
        topCountries: [],
        topDevices: [],
        hourlyData: Array(24).fill(0),
        recentScans: [],
      };
    }
  },

  // Get detailed scan data from real tracking
  async getScanData(qrCodeId: number): Promise<ScanData[]> {
    try {
      const response = await api.get(`/analytics/scans/${qrCodeId}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching scan data:', error);
      return [];
    }
  },

  // Get scan analytics by date range from real data
  async getScansByDateRange(startDate: string, endDate: string): Promise<ScanData[]> {
    try {
      const response = await api.get(`/analytics/scans?startDate=${startDate}&endDate=${endDate}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching scans by date range:', error);
      return [];
    }
  },

  // Get analytics for specific user's content
  async getUserAnalytics(userId: number): Promise<any> {
    try {
      const response = await api.get(`/analytics/user/${userId}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching user analytics:', error);
      return {
        totalQRCodes: 0,
        totalScans: 0,
        totalPlaylists: 0,
        totalSlideshows: 0,
        totalProducts: 0,
        recentActivity: [],
      };
    }
  },

  // Track QR code scan
  async trackQRScan(qrCodeId: number, scanData: {
    location?: string;
    device?: string;
    countryName?: string;
    countryCode?: string;
    deviceType?: string;
    browserName?: string;
    operatingSystem?: string;
    ipAddress?: string;
  }): Promise<void> {
    try {
      await api.post('/analytics/track-scan', {
        qrCodeId,
        ...scanData,
      });
    } catch (error) {
      console.error('Error tracking QR scan:', error);
    }
  },

  // Track playlist access
  async trackPlaylistAccess(playlistId: number, accessData: {
    location?: string;
    device?: string;
    userAgent?: string;
    ipAddress?: string;
  }): Promise<void> {
    try {
      await api.post('/analytics/track-playlist-access', {
        playlistId,
        ...accessData,
      });
    } catch (error) {
      console.error('Error tracking playlist access:', error);
    }
  },

  // Track slideshow access
  async trackSlideshowAccess(slideshowId: number, accessData: {
    location?: string;
    device?: string;
    userAgent?: string;
    ipAddress?: string;
  }): Promise<void> {
    try {
      await api.post('/analytics/track-slideshow-access', {
        slideshowId,
        ...accessData,
      });
    } catch (error) {
      console.error('Error tracking slideshow access:', error);
    }
  },
};