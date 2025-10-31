import { AnalyticsSummary, ScanData } from '../types';
import { api } from './api';

export const analyticsService = {
  // Get analytics summary from real data
  async getAnalyticsSummary(options?: { days?: number; qrCodeId?: number }): Promise<AnalyticsSummary> {
    try {
      // Fetch real analytics data from server
      // Server route is namespaced under /api
      const params = new URLSearchParams();
      if (options?.days) params.set('days', String(options.days));
      if (options?.qrCodeId) params.set('qrCodeId', String(options.qrCodeId));
      const qs = params.toString();
      const response = await api.get(`/analytics/summary${qs ? `?${qs}` : ''}`);
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

  // Submit browser geolocation for a recent scan (links via qr_vid cookie)
  async submitBrowserGeo(qrCodeId: number, lat: number, lng: number, accuracy?: number): Promise<void> {
    try {
      // Round client-side to ~2 decimals (~1–3 km)
      const r = (n: number) => Math.round(n * 100) / 100;
      await api.post('/analytics/geo', {
        qrCodeId,
        lat: r(lat),
        lng: r(lng),
        accuracy,
      });
    } catch (error) {
      console.error('Error submitting browser geolocation:', error);
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
    userLocation?: { city: string; state: string; zip?: string };
    userAge?: string;
    userGender?: string;
  }): Promise<void> {
    try {
      // Import visitor ID utility dynamically to avoid SSR issues
      const { getOrCreateVisitorId } = await import('@/utils/visitorId');
      const visitorId = getOrCreateVisitorId();
      
      const response = await api.post('/analytics/track-scan', {
        qrCodeId,
        visitorId, // Include visitor ID as fallback when cookies don't work
        ...scanData,
      });
      
      // Store the visitor ID returned from server (in case server generated a new one)
      if (response.data?.visitorId && typeof window !== 'undefined') {
        try {
          const { getOrCreateVisitorId: getVisitorId } = await import('@/utils/visitorId');
          const currentId = getVisitorId();
          // Only update if server returned a different ID (shouldn't happen, but be safe)
          if (response.data.visitorId !== currentId) {
            localStorage.setItem('qr_visitor_id', response.data.visitorId);
            console.log('🍪 VISITOR_ID: Updated from server response');
          }
        } catch (e) {
          // Ignore localStorage errors
        }
      }
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

  // Track media play (only counts plays >= 30 seconds)
  async trackMediaPlay(
    mediaId: number,
    playDuration: number,
    sessionId: string,
    userId?: number
  ): Promise<void> {
    try {
      if (playDuration < 30) {
        console.log('📊 ANALYTICS: Media play duration < 30s, not tracking');
        return;
      }

      await api.post('/analytics/track-media-play', {
        mediaId,
        playDuration,
        sessionId,
        userId,
      });
      console.log(`📊 ANALYTICS: Tracked media play - ID: ${mediaId}, Duration: ${playDuration}s`);
    } catch (error) {
      console.error('Error tracking media play:', error);
    }
  },

  // Track playlist play (only counts plays >= 30 seconds)
  async trackPlaylistPlay(
    playlistId: number,
    playDuration: number,
    sessionId: string,
    userId?: number
  ): Promise<void> {
    try {
      if (playDuration < 30) {
        console.log('📊 ANALYTICS: Playlist play duration < 30s, not tracking');
        return;
      }

      await api.post('/analytics/track-playlist-play', {
        playlistId,
        playDuration,
        sessionId,
        userId,
      });
      console.log(`📊 ANALYTICS: Tracked playlist play - ID: ${playlistId}, Duration: ${playDuration}s`);
    } catch (error) {
      console.error('Error tracking playlist play:', error);
    }
  },

  // Track slideshow play (only counts plays >= 30 seconds)
  async trackSlideshowPlay(
    slideshowId: number,
    playDuration: number,
    sessionId: string,
    userId?: number
  ): Promise<void> {
    try {
      if (playDuration < 30) {
        console.log('📊 ANALYTICS: Slideshow play duration < 30s, not tracking');
        return;
      }

      await api.post('/analytics/track-slideshow-play', {
        slideshowId,
        playDuration,
        sessionId,
        userId,
      });
      console.log(`📊 ANALYTICS: Tracked slideshow play - ID: ${slideshowId}, Duration: ${playDuration}s`);
    } catch (error) {
      console.error('Error tracking slideshow play:', error);
    }
  },

  // Track cart addition
  async trackCartAdd(
    productId: string | number,
    quantity: number,
    sessionId: string,
    userId?: number
  ): Promise<void> {
    try {
      await api.post('/analytics/track-cart-add', {
        productId,
        quantity,
        sessionId,
        userId,
      });
      console.log(`📊 ANALYTICS: Tracked cart add - Product: ${productId}, Qty: ${quantity}`);
    } catch (error) {
      console.error('Error tracking cart add:', error);
    }
  },

  // Track purchase completion
  async trackPurchase(
    stripeSessionId: string,
    items: any[],
    totalAmount: number,
    userId?: number
  ): Promise<void> {
    try {
      await api.post('/analytics/track-purchase', {
        stripeSessionId,
        items,
        totalAmount,
        userId,
      });
      console.log(`📊 ANALYTICS: Tracked purchase - Session: ${stripeSessionId}, Amount: ${totalAmount}`);
    } catch (error) {
      console.error('Error tracking purchase:', error);
    }
  },

  // Get play statistics
  async getPlayStats(userId?: number): Promise<any> {
    try {
      const params = userId ? `?userId=${userId}` : '';
      const response = await api.get(`/analytics/play-stats${params}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching play stats:', error);
      return {
        totalMediaPlays: 0,
        uniqueMediaPlays: 0,
        totalPlaylistPlays: 0,
        uniquePlaylistPlays: 0,
        totalSlideshowPlays: 0,
        uniqueSlideshowPlays: 0,
        mostPlayedMedia: [],
        averagePlayDuration: 0,
      };
    }
  },

  // Get cart conversion statistics
  async getCartConversionStats(userId?: number): Promise<any> {
    try {
      const params = userId ? `?userId=${userId}` : '';
      const response = await api.get(`/analytics/cart-conversion${params}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching cart conversion stats:', error);
      return {
        totalItemsAddedToCart: 0,
        totalItemsPurchased: 0,
        conversionRate: 0,
        totalRevenue: 0,
        averageOrderValue: 0,
      };
    }
  },
};