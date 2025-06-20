
import { QRCode, CreateQRCodeData } from '../types';

export const qrCodeService = {
  // Get all QR codes for the current user
  async getQRCodes(): Promise<QRCode[]> {
    // Mock data for development
    return Promise.resolve([
      {
        id: 1,
        name: 'Website Homepage',
        url: 'https://merchtech.com',
        shortUrl: 'https://mtech.ly/abc123',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isActive: true,
        scanCount: 156,
        options: {
          size: 200,
          foregroundColor: '#000000',
          backgroundColor: '#FFFFFF',
          logo: null
        }
      },
      {
        id: 2,
        name: 'Product Catalog',
        url: 'https://merchtech.com/products',
        shortUrl: 'https://mtech.ly/def456',
        createdAt: new Date(Date.now() - 86400000).toISOString(),
        updatedAt: new Date(Date.now() - 86400000).toISOString(),
        isActive: true,
        scanCount: 89,
        options: {
          size: 200,
          foregroundColor: '#1a1a1a',
          backgroundColor: '#ffffff',
          logo: null
        }
      },
      {
        id: 3,
        name: 'Contact Info',
        url: 'https://merchtech.com/contact',
        shortUrl: 'https://mtech.ly/ghi789',
        createdAt: new Date(Date.now() - 172800000).toISOString(),
        updatedAt: new Date(Date.now() - 172800000).toISOString(),
        isActive: true,
        scanCount: 234,
        options: {
          size: 200,
          foregroundColor: '#000000',
          backgroundColor: '#ffffff',
          logo: null
        }
      }
    ]);
  },

  // Create a new QR code
  async createQRCode(data: CreateQRCodeData): Promise<QRCode> {
    // Mock creation for development
    const newQRCode: QRCode = {
      id: Math.floor(Math.random() * 1000),
      name: data.name,
      url: data.url,
      shortUrl: `https://mtech.ly/${Math.random().toString(36).substr(2, 6)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isActive: true,
      scanCount: 0,
      options: data.options || {
        size: 200,
        foregroundColor: '#000000',
        backgroundColor: '#FFFFFF',
        logo: null
      }
    };
    
    return Promise.resolve(newQRCode);
  },

  // Update an existing QR code
  async updateQRCode(id: number, data: Partial<CreateQRCodeData>): Promise<QRCode> {
    // Mock update for development
    const qrCodes = await this.getQRCodes();
    const existing = qrCodes.find(qr => qr.id === id);
    
    if (!existing) {
      throw new Error('QR Code not found');
    }

    const updated: QRCode = {
      ...existing,
      ...data,
      updatedAt: new Date().toISOString()
    };

    return Promise.resolve(updated);
  },

  // Delete a QR code
  async deleteQRCode(id: number): Promise<void> {
    // Mock deletion for development
    return Promise.resolve();
  },

  // Get a specific QR code by ID
  async getQRCodeById(id: number): Promise<QRCode | null> {
    const qrCodes = await this.getQRCodes();
    return qrCodes.find(qr => qr.id === id) || null;
  }
};
