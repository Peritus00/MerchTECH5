
import { AnalyticsSummary, ScanData } from '../types';

export const analyticsService = {
  // Get analytics summary
  async getAnalyticsSummary(): Promise<AnalyticsSummary> {
    // Mock data for development
    return Promise.resolve({
      totalScans: 1250,
      todayScans: 45,
      weekScans: 234,
      monthScans: 892,
      topCountries: [
        { country: 'United States', count: 345 },
        { country: 'Canada', count: 189 },
        { country: 'United Kingdom', count: 156 },
        { country: 'Germany', count: 134 },
        { country: 'France', count: 98 }
      ],
      topDevices: [
        { device: 'iPhone', count: 567 },
        { device: 'Android', count: 432 },
        { device: 'iPad', count: 123 },
        { device: 'Desktop', count: 89 },
        { device: 'Other', count: 39 }
      ]
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
