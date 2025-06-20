import { AnalyticsSummary, ScanData } from '../types';

export const analyticsService = {
  // Get analytics summary
  async getAnalyticsSummary(): Promise<AnalyticsSummary> {
    // Mock data for development
    return Promise.resolve({
      totalScans: 1247,
      todayScans: 89,
      weekScans: 423,
      monthScans: 856,
      uniqueVisitors: 789,
      avgScansPerDay: 42,
      conversionRate: 12.5,
      scanGrowth: 15.2,
      visitorGrowth: 8.7,
      dailyGrowth: 22.1,
      conversionGrowth: 5.3,
      topCountries: [
        { country: 'United States', count: 456, flag: '🇺🇸' },
        { country: 'Canada', count: 234, flag: '🇨🇦' },
        { country: 'United Kingdom', count: 189, flag: '🇬🇧' },
        { country: 'Germany', count: 167, flag: '🇩🇪' },
        { country: 'France', count: 98, flag: '🇫🇷' },
      ],
      topDevices: [
        { device: 'iPhone 15 Pro', count: 234 },
        { device: 'Samsung Galaxy S24', count: 189 },
        { device: 'iPhone 14', count: 156 },
        { device: 'Google Pixel 8', count: 134 },
        { device: 'OnePlus 12', count: 98 },
      ],
      hourlyData: [2, 1, 0, 1, 3, 8, 15, 25, 35, 42, 38, 45, 52, 48, 44, 51, 58, 62, 45, 38, 28, 18, 12, 6],
      recentScans: [
        {
          qrName: 'Website Homepage',
          location: 'New York, US',
          device: 'iPhone 15 Pro',
          timestamp: new Date().toISOString(),
        },
        {
          qrName: 'Product Catalog',
          location: 'Toronto, CA',
          device: 'Samsung Galaxy S24',
          timestamp: new Date(Date.now() - 300000).toISOString(),
        },
        {
          qrName: 'Contact Info',
          location: 'London, UK',
          device: 'iPhone 14',
          timestamp: new Date(Date.now() - 600000).toISOString(),
        },
      ],
    });
  },

  // Get detailed scan data
  async getScanData(qrCodeId: number): Promise<ScanData[]> {
    // Mock data for development
    return Promise.resolve([
      {
        id: 1,
        qrCodeId,
        timestamp: new Date().toISOString(),
        location: 'New York, NY',
        device: 'iPhone 15',
        browser: 'Safari',
        ipAddress: '192.168.1.1'
      },
      {
        id: 2,
        qrCodeId,
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        location: 'Los Angeles, CA',
        device: 'Samsung Galaxy S24',
        browser: 'Chrome',
        ipAddress: '192.168.1.2'
      }
    ]);
  },

  // Get scan analytics by date range
  async getScansByDateRange(startDate: string, endDate: string): Promise<ScanData[]> {
    // Mock data for development
    return this.getScanData(1);
  }
};