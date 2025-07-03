export interface User {
  id: number;
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
  isAdmin: boolean;
  subscriptionTier: 'free' | 'basic' | 'premium';
  permissions?: string[];
  isEmailVerified?: boolean;
  isSuspended: boolean;
  isPending?: boolean;
  pendingExpiry?: Date;
  lastActive: string;
  createdAt: string;
  isNewUser?: boolean;
  canViewAnalytics: boolean;
  canManagePlaylists: boolean;
  canEditPlaylists: boolean;
  canUploadMedia: boolean;
  canGenerateCodes: boolean;
  canAccessStore: boolean;
  canViewFanmail: boolean;
  canManageQRCodes: boolean;
  maxPlaylists: number;
  maxVideos: number;
  maxAudioFiles: number;
  maxActivationCodes: number;
  maxProducts: number;
  maxQrCodes: number;
  maxSlideshows: number;
}

export interface QRCode {
  id: number;
  ownerId: number;
  name: string;
  url: string;
  qrCodeData: string;
  shortUrl?: string;
  description?: string;
  options?: QRCodeOptions;
  isActive: boolean;
  scanCount?: number;
  createdAt: string;
  created_at?: string; // Backend uses snake_case
  updatedAt?: string;
  updated_at?: string; // Backend uses snake_case
  contentType?: 'url' | 'text' | 'email' | 'phone' | 'playlist' | 'slideshow' | 'store';
}

export interface QRCodeOptions {
  size?: number;
  foregroundColor?: string;
  backgroundColor?: string;
  logo?: string | null;
  logoSize?: number;
  logoBorderRadius?: number;
  logoBorderSize?: number;
  logoBorderColor?: string;
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  cornerRadius?: number;
  gradientColors?: {
    startColor: string;
    endColor: string;
    type: 'linear' | 'radial';
    angle?: number;
  };
}

export interface CreateQRCodeData {
  name: string;
  url: string;
  description?: string;
  contentType?: 'url' | 'text' | 'email' | 'phone' | 'playlist' | 'slideshow' | 'store';
  options?: QRCodeOptions;
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
  uniqueVisitors: number;
  avgScansPerDay: number;
  conversionRate: number;
  scanGrowth: number;
  visitorGrowth: number;
  dailyGrowth: number;
  conversionGrowth: number;
  topCountries: Array<{ 
    country: string; 
    count: number; 
    flag?: string;
  }>;
  topDevices: Array<{ device: string; count: number }>;
  hourlyData: number[];
  recentScans: Array<{
    qrName: string;
    location: string;
    device: string;
    timestamp: string;
  }>;
}