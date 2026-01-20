import { QRCode, CreateQRCodeData } from '../types';
import { qrCodeAPI } from './api';

export const qrCodeService = {
  // Get all QR codes for the current user
  async getQRCodes(): Promise<QRCode[]> {
    try {
      console.log('📱 QRCodeService: Fetching QR codes from API');
      const response = await qrCodeAPI.getAll();
      console.log('📱 QRCodeService: Raw response:', response);
      
      // Handle both response formats: direct array or { qrCodes: [...] }
      const qrCodes = Array.isArray(response) ? response : (response.qrCodes || []);
      console.log('📱 QRCodeService: Received', qrCodes.length, 'QR codes');
      return qrCodes;
    } catch (error) {
      console.error('📱 QRCodeService: Error fetching QR codes:', error);
      throw error;
    }
  },

  // Create a new QR code
  async createQRCode(data: CreateQRCodeData): Promise<QRCode> {
    try {
      console.log('📱 QRCodeService: ============ CREATE QR CODE DEBUG START ============');
      console.log('📱 QRCodeService: Creating QR code with data:', JSON.stringify(data, null, 2));
      console.log('📱 QRCodeService: About to call qrCodeAPI.create...');
      
      const response = await qrCodeAPI.create(data);
      console.log('📱 QRCodeService: Raw response:', response);
      
      // Handle both response formats: direct object or { qrCode: {...} }
      const qrCode = response.qrCode || response;
      
      console.log('📱 QRCodeService: qrCodeAPI.create returned successfully');
      console.log('📱 QRCodeService: Result:', JSON.stringify(qrCode, null, 2));
      console.log('📱 QRCodeService: ============ CREATE QR CODE DEBUG END ============');
      return qrCode;
    } catch (error: any) {
      console.error('📱 QRCodeService: ============ CREATE QR CODE ERROR DEBUG START ============');
      console.error('📱 QRCodeService: Error creating QR code:', error);
      console.error('📱 QRCodeService: Error type:', typeof error);
      console.error('📱 QRCodeService: Error message:', error.message);
      console.error('📱 QRCodeService: Error stack:', error.stack);
      
      if (error.response) {
        console.error('📱 QRCodeService: API Error response:', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data,
          url: error.response.config?.url,
          method: error.response.config?.method,
          headers: error.response.config?.headers
        });
      } else if (error.request) {
        console.error('📱 QRCodeService: Network error - no response received:', error.request);
      }
      
      console.error('📱 QRCodeService: ============ CREATE QR CODE ERROR DEBUG END ============');
      throw error;
    }
  },

  // Update an existing QR code
  async updateQRCode(id: number, data: Partial<CreateQRCodeData>): Promise<QRCode> {
    try {
      console.log('📱 QRCodeService: Updating QR code:', id);
      const response = await qrCodeAPI.update(id.toString(), data);
      console.log('📱 QRCodeService: Raw response:', response);
      
      // Handle both response formats: direct object or { qrCode: {...} }
      const qrCode = response.qrCode || response;
      console.log('📱 QRCodeService: QR code updated successfully');
      return qrCode;
    } catch (error) {
      console.error('📱 QRCodeService: Error updating QR code:', error);
      throw error;
    }
  },

  // Delete a QR code
  async deleteQRCode(id: number): Promise<void> {
    try {
      console.log('📱 QRCodeService: Deleting QR code:', id);
      console.log('📱 QRCodeService: ID type:', typeof id);
      console.log('📱 QRCodeService: Converting to string:', id.toString());
      
      const result = await qrCodeAPI.delete(id.toString());
      console.log('📱 QRCodeService: Delete API response:', result);
      console.log('📱 QRCodeService: QR code deleted successfully');
    } catch (error: any) {
      console.error('📱 QRCodeService: Error deleting QR code:', error);
      console.error('📱 QRCodeService: Error details:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        url: error.config?.url,
        method: error.config?.method
      });
      
      // Provide more specific error messages
      if (error.response?.status === 403) {
        throw new Error('You do not have permission to delete this QR code');
      } else if (error.response?.status === 404) {
        throw new Error('QR code not found or already deleted');
      } else if (error.response?.status === 401) {
        throw new Error('Authentication required. Please log in again.');
      } else {
        throw new Error(error.response?.data?.error || error.message || 'Failed to delete QR code');
      }
    }
  },

  // Request deletion of a QR code (delegates)
  async requestDeleteQRCode(id: number, reason?: string): Promise<void> {
    try {
      console.log('📱 QRCodeService: Requesting delete for QR code:', id);
      await qrCodeAPI.requestDelete(id.toString(), reason);
      console.log('📱 QRCodeService: Delete request submitted');
    } catch (error: any) {
      console.error('📱 QRCodeService: Error requesting delete:', error);
      throw new Error(error.response?.data?.error || error.message || 'Failed to request delete');
    }
  },

  // Get a specific QR code by ID
  async getQRCodeById(id: number): Promise<QRCode | null> {
    try {
      console.log('📱 QRCodeService: Fetching QR code by ID:', id);
      const response = await qrCodeAPI.getById(id.toString());
      console.log('📱 QRCodeService: Raw response:', response);
      
      // Handle both response formats: direct object or { qrCode: {...} }
      const qrCode = response.qrCode || response;
      console.log('📱 QRCodeService: QR code found');
      return qrCode;
    } catch (error) {
      console.error('📱 QRCodeService: Error fetching QR code by ID:', error);
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }
};
