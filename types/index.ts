
export interface User {
  id: number;
  email: string;
  username?: string;
  subscriptionTier: string;
  createdAt: string;
}

export interface QRCode {
  id: number;
  ownerId: number;
  name: string;
  url: string;
  qrCodeData: string;
  options?: QRCodeOptions;
  createdAt: string;
  isActive: boolean;
}

export interface QRCodeOptions {
  foregroundColor?: string;
  backgroundColor?: string;
  size?: number;
  logoUrl?: string;
  cornerRadius?: number;
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
}

export interface QRScan {
  id: number;
  qrCodeId: number;
  scannedAt: string;
  location?: string;
  device?: string;
  countryName?: string;
  countryCode?: string;
  deviceType?: string;
  browserName?: string;
  operatingSystem?: string;
}

export interface Product {
  id: number;
  ownerId: number;
  name: string;
  description?: string;
  price: number;
  imageUrl?: string;
  isActive: boolean;
  createdAt: string;
}

export interface Slideshow {
  id: number;
  ownerId: number;
  title: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  images?: SlideshowImage[];
}

export interface SlideshowImage {
  id: number;
  slideshowId: number;
  imageUrl: string;
  caption?: string;
  orderIndex: number;
}

export interface Fanmail {
  id: number;
  ownerId: number;
  qrCodeId?: number;
  slideshowId?: number;
  title: string;
  status: 'read' | 'unread';
  contentType?: string;
  visitorCountry?: string;
  visitorDevice?: string;
  scannedAt: string;
}

export interface AchievementLevel {
  id: number;
  level: number;
  name: string;
  description?: string;
  scansRequired: number;
}

export interface AnalyticsSummary {
  totalScans: number;
  todayScans: number;
  weekScans: number;
  monthScans: number;
  topCountries: Array<{ country: string; count: number }>;
  topDevices: Array<{ device: string; count: number }>;
  scanHistory: Array<{ date: string; count: number }>;
}
