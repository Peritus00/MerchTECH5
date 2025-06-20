
import api from './api';
import { AnalyticsSummary } from '../types';

export const analyticsService = {
  // Get analytics summary
  async getAnalyticsSummary(): Promise<AnalyticsSummary> {
    const response = await api.get('/analytics/summary');
    return response.data;
  },

  // Get analytics history for specific days
  async getAnalyticsHistory(days: number): Promise<any> {
    const response = await api.get(`/analytics/history/${days}`);
    return response.data;
  },

  // Get geographic analytics
  async getGeographicAnalytics(): Promise<Array<{ country: string; count: number }>> {
    const response = await api.get('/analytics/geographic');
    return response.data;
  },

  // Get device analytics
  async getDeviceAnalytics(): Promise<Array<{ device: string; count: number }>> {
    const response = await api.get('/analytics/devices');
    return response.data;
  },
};
