export interface User {
  id: number;
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
  isAdmin: boolean;
  accountType?: 'creator' | 'viewer';
  subscriptionTier: 'free' | 'basic' | 'premium';
  permissions?: string[];
  isEmailVerified?: boolean;
  phoneE164?: string | null;
  phoneVerifiedAt?: string | null;
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
  canViewLogs?: boolean;
  maxPlaylists: number;
  maxVideos: number;
  maxAudioFiles: number;
  maxActivationCodes: number;
  maxProducts: number;
  maxQrCodes: number;
  maxSlideshows: number;
  googleId?: string | null;
  appleId?: string | null;
}

export interface QRCode {
  id: number;
  ownerId: number;
  user_id?: number;
  name: string;
  url: string;
  qrCodeData: string;
  shortUrl?: string;
  description?: string;
  options?: QRCodeOptions;
  isActive: boolean;
  is_active?: boolean;
  scanCount?: number;
  is_delegate?: boolean;
  deleteRequest?: {
    id: number;
    status: 'pending' | 'approved' | 'denied';
    requested_at: string;
  };
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
  topCities?: Array<{ 
    city: string; 
    region: string; 
    country: string; 
    count: number;
    qrCodes?: Array<{
      qrCodeId: number;
      qrName: string;
      scanCount: number;
    }>;
  }>;
  topDevices: Array<{ device: string; count: number }>;
  hourlyData: number[];
  dailyScanHistory?: Array<{ date: string; count: number }>;
  mostPopularQRCode?: { qrCodeId: number; qrName: string; scanCount: number } | null;
  recentScans: Array<{
    qrName: string;
    location: string;
    device: string;
    timestamp: string;
  }>;
}

export interface ActivityLog {
  id: number;
  userId: number | null;
  userEmail: string | null;
  username: string | null;
  actionType: string;
  resourceType: string | null;
  resourceId: number | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestMethod: string;
  endpoint: string;
  statusCode: number;
  metadata: Record<string, any> | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface ActivityLogFilters {
  userId?: number;
  actionType?: string;
  resourceType?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
  search?: string;
}

export interface ActivityLogPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ActivityLogResponse {
  logs: ActivityLog[];
  pagination: ActivityLogPagination;
}

export interface ActivityLogStats {
  summary: {
    totalActions: number;
    uniqueUsers: number;
    errorCount: number;
    loginCount: number;
    createCount: number;
    updateCount: number;
    deleteCount: number;
  };
  topActions: Array<{
    actionType: string;
    count: number;
  }>;
}

// Deleted items types (for admin restore functionality)
export interface DeletedQRCode extends QRCode {
  owner_id: number;
  owner_username: string;
  owner_email: string;
  deleted_at: string;
}

export interface DeletedPlaylist {
  id: number;
  name: string;
  description?: string;
  requires_activation_code: boolean;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string;
  owner_id: number;
  owner_username: string;
  owner_email: string;
}

export interface DeletedSlideshow {
  id: number;
  name: string;
  description?: string;
  requires_activation_code: boolean;
  is_public: boolean;
  autoplay_interval?: number;
  transition?: string;
  audio_url?: string;
  created_at: string;
  updated_at: string;
  deleted_at: string;
  owner_id: number;
  owner_username: string;
  owner_email: string;
}

export interface DeletedActivationCode {
  id: number;
  code: string;
  playlist_id?: number;
  slideshow_id?: number;
  playlist_name?: string;
  slideshow_name?: string;
  content_type: 'playlist' | 'slideshow';
  created_by: number;
  owner_username: string;
  owner_email: string;
  deleted_at: string;
  created_at: string;
  max_uses?: number;
  uses_count: number;
  expires_at?: string;
}

// Admin User Tracking Types
export interface AdminUserStats {
  totalSignedInUsers: number;
  totalAnonymousUsers: number;
  activeUsers7d: number;
  activeUsers30d: number;
  activeAnonymous7d: number;
  activeAnonymous30d: number;
  activityBreakdown: UserActivityBreakdown[];
}

export interface UserActivityBreakdown {
  activityType: 'qr_scans' | 'media_plays' | 'playlist_plays' | 'slideshow_plays' | 'cart_events';
  count: number;
}

export interface AdminUserHistory {
  timeframe: 'daily' | 'weekly' | 'monthly';
  signedInUsers: Array<{ date: string; count: number }>;
  anonymousUsers: Array<{ date: string; count: number }>;
  activeUsers: Array<{ date: string; count: number }>;
  activeAnonymousUsers: Array<{ date: string; count: number }>;
}