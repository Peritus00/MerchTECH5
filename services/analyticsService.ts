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

  // Track QR code scan - queues for replay on network failure
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
    previewPhoneLeadId?: number;
  }): Promise<void> {
    try {
      const { getOrCreateVisitorId } = await import('@/utils/visitorId');
      const visitorId = getOrCreateVisitorId();
      const payload = { qrCodeId, visitorId, ...scanData };
      const response = await api.post('/analytics/track-scan', payload);
      if (response.data?.visitorId && typeof window !== 'undefined') {
        try {
          const { getOrCreateVisitorId: getVisitorId } = await import('@/utils/visitorId');
          const currentId = getVisitorId();
          if (response.data.visitorId !== currentId) {
            localStorage.setItem('qr_visitor_id', response.data.visitorId);
          }
        } catch (e) {}
      }
    } catch (error) {
      console.warn('QR scan tracking failed, queuing for replay:', error);
      const { enqueue } = await import('@/services/pendingActionsQueue');
      const { getOrCreateVisitorId } = await import('@/utils/visitorId');
      await enqueue({
        type: 'analytics',
        endpoint: '/analytics/track-scan',
        method: 'POST',
        payload: { qrCodeId, visitorId: getOrCreateVisitorId(), ...scanData },
      });
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

  // Track media play (all durations) - queues for replay on network failure
  async trackMediaPlay(
    mediaId: number,
    playDuration: number,
    sessionId: string,
    userId?: number,
    ageRange?: string,
    gender?: string,
    location?: { city: string; state: string; zip?: string },
    locationSource?: string,
    previewPhoneLeadId?: number
  ): Promise<void> {
    const payload = {
      mediaId,
      playDuration,
      sessionId,
      userId,
      userAge: ageRange,
      userGender: gender,
      userLocation: location,
      locationSource,
      previewPhoneLeadId,
    };
    try {
      await api.post('/analytics/track-media-play', payload);
    } catch (error: any) {
      console.warn('Media play tracking failed, queuing for replay:', error?.message);
      const { enqueue } = await import('@/services/pendingActionsQueue');
      await enqueue({
        type: 'analytics',
        endpoint: '/analytics/track-media-play',
        method: 'POST',
        payload,
      });
      throw error;
    }
  },

  // Track playlist play (only counts plays >= 30 seconds) - queues for replay on failure
  async trackPlaylistPlay(
    playlistId: number,
    playDuration: number,
    sessionId: string,
    userId?: number,
    ageRange?: string,
    gender?: string,
    location?: { city: string; state: string; zip?: string },
    locationSource?: string,
    previewPhoneLeadId?: number
  ): Promise<void> {
    if (playDuration < 30) return;
    const payload = {
      playlistId,
      playDuration,
      sessionId,
      userId,
      userAge: ageRange,
      userGender: gender,
      userLocation: location,
      locationSource,
      previewPhoneLeadId,
    };
    try {
      await api.post('/analytics/track-playlist-play', payload);
    } catch (error) {
      console.warn('Playlist play tracking failed, queuing for replay:', error);
      const { enqueue } = await import('@/services/pendingActionsQueue');
      await enqueue({
        type: 'analytics',
        endpoint: '/analytics/track-playlist-play',
        method: 'POST',
        payload,
      });
    }
  },

  // Track slideshow play (only counts plays >= 30 seconds) - queues for replay on failure
  async trackSlideshowPlay(
    slideshowId: number,
    playDuration: number,
    sessionId: string,
    userId?: number,
    ageRange?: string,
    gender?: string,
    location?: { city: string; state: string; zip?: string },
    locationSource?: string,
    previewPhoneLeadId?: number
  ): Promise<void> {
    if (playDuration < 30) return;
    const payload = {
      slideshowId,
      playDuration,
      sessionId,
      userId,
      userAge: ageRange,
      userGender: gender,
      userLocation: location,
      locationSource,
      previewPhoneLeadId,
    };
    try {
      await api.post('/analytics/track-slideshow-play', payload);
    } catch (error) {
      console.warn('Slideshow play tracking failed, queuing for replay:', error);
      const { enqueue } = await import('@/services/pendingActionsQueue');
      await enqueue({
        type: 'analytics',
        endpoint: '/analytics/track-slideshow-play',
        method: 'POST',
        payload,
      });
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

  // Get stats for a specific media item
  async getMediaStats(mediaId: number, userId?: number): Promise<any> {
    try {
      const params = userId ? `?userId=${userId}` : '';
      const response = await api.get(`/analytics/media-stats/${mediaId}${params}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching media stats:', error);
      return {
        mediaId,
        media: null,
        totalPlays: 0,
        uniquePlays: 0,
        averageDuration: 0,
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

  // Get age demographics for media plays
  async getMediaPlayAgeDemographics(userId?: number, uniqueOnly: boolean = false): Promise<any> {
    try {
      const params = new URLSearchParams();
      if (userId) params.set('userId', String(userId));
      if (uniqueOnly) params.set('uniqueOnly', 'true');
      const response = await api.get(`/analytics/media-plays/age-demographics?${params.toString()}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching media play age demographics:', error);
      return {
        success: false,
        uniqueOnly,
        ageRanges: [],
      };
    }
  },

  // Get location demographics for media plays
  async getMediaPlayLocationDemographics(userId?: number, uniqueOnly: boolean = false): Promise<any> {
    try {
      const params = new URLSearchParams();
      if (userId) params.set('userId', String(userId));
      if (uniqueOnly) params.set('uniqueOnly', 'true');
      const response = await api.get(`/analytics/media-plays/location-demographics?${params.toString()}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching media play location demographics:', error);
      return {
        success: false,
        uniqueOnly,
        topCountries: [],
        topCities: [],
      };
    }
  },

  // Get gender demographics for media plays
  async getMediaPlayGenderDemographics(userId?: number, uniqueOnly: boolean = false): Promise<any> {
    try {
      const params = new URLSearchParams();
      if (userId) params.set('userId', String(userId));
      if (uniqueOnly) params.set('uniqueOnly', 'true');
      const response = await api.get(`/analytics/media-plays/gender-demographics?${params.toString()}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching media play gender demographics:', error);
      return {
        success: false,
        uniqueOnly,
        genderDistribution: [],
      };
    }
  },

  // Get location demographics for QR code scans
  async getQRScanLocationDemographics(userId?: number, days?: number): Promise<any> {
    try {
      const params = new URLSearchParams();
      if (userId) params.set('userId', String(userId));
      if (days) params.set('days', String(days));
      const response = await api.get(`/analytics/qr-scans/location-demographics?${params.toString()}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching QR scan location demographics:', error);
      return {
        success: false,
        topCountries: [],
        topCities: [],
      };
    }
  },

  // Get age demographics for QR code scans
  async getQRScanAgeDemographics(userId?: number, days?: number): Promise<any> {
    try {
      const params = new URLSearchParams();
      if (userId) params.set('userId', String(userId));
      if (days) params.set('days', String(days));
      const response = await api.get(`/analytics/qr-scans/age-demographics?${params.toString()}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching QR scan age demographics:', error);
      return {
        success: false,
        ageRanges: [],
      };
    }
  },

  // Get gender demographics for QR code scans
  async getQRScanGenderDemographics(userId?: number, days?: number): Promise<any> {
    try {
      const params = new URLSearchParams();
      if (userId) params.set('userId', String(userId));
      if (days) params.set('days', String(days));
      const response = await api.get(`/analytics/qr-scans/gender-demographics?${params.toString()}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching QR scan gender demographics:', error);
      return {
        success: false,
        genderDistribution: [],
      };
    }
  },

  // Get per-media-item stats (for Behavior tab)
  async getMediaItemsStats(): Promise<any> {
    try {
      const response = await api.get('/analytics/media-items-stats');
      return response.data;
    } catch (error) {
      console.error('Error fetching media items stats:', error);
      return {
        success: false,
        mediaItems: [],
      };
    }
  },
};