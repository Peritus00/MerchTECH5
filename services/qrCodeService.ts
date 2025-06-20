
import api from './api';
import { QRCode, QRCodeOptions, QRScan } from '../types';

export const qrCodeService = {
  // Get all QR codes for the user
  async getQRCodes(): Promise<QRCode[]> {
    const response = await api.get('/qrcodes');
    return response.data;
  },

  // Get a specific QR code
  async getQRCode(id: number): Promise<QRCode> {
    const response = await api.get(`/qrcodes/${id}`);
    return response.data;
  },

  // Create a new QR code
  async createQRCode(data: {
    name: string;
    url: string;
    options?: QRCodeOptions;
  }): Promise<QRCode> {
    const response = await api.post('/qrcodes', data);
    return response.data;
  },

  // Update a QR code
  async updateQRCode(id: number, data: Partial<QRCode>): Promise<QRCode> {
    const response = await api.put(`/qrcodes/${id}`, data);
    return response.data;
  },

  // Delete a QR code
  async deleteQRCode(id: number): Promise<void> {
    await api.delete(`/qrcodes/${id}`);
  },

  // Record a scan
  async recordScan(data: {
    qrCodeId: number;
    location?: string;
    device?: string;
    countryName?: string;
    countryCode?: string;
    deviceType?: string;
    browserName?: string;
    operatingSystem?: string;
  }): Promise<QRScan> {
    const response = await api.post('/qr-scans', data);
    return response.data;
  },

  // Get scan history for a QR code
  async getScanHistory(qrCodeId: number): Promise<QRScan[]> {
    const response = await api.get(`/qr-scans/${qrCodeId}`);
    return response.data;
  },
};
