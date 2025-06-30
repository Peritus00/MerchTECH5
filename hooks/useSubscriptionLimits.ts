import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { SUBSCRIPTION_TIERS } from '@/types/subscription';
import api from '@/services/api';

export interface UsageStats {
  products: number;
  media: number;
  playlists: number;
  qrCodes: number;
  slideshows: number;
}

export interface SubscriptionLimitsData {
  tier: string;
  limits: {
    maxProducts: number;
    maxAudioFiles: number;
    maxPlaylists: number;
    maxQrCodes: number;
    maxSlideshows: number;
    canEditPlaylists: boolean;
  };
  usage: UsageStats;
  isLoading: boolean;
  refresh: () => Promise<void>;
  canCreate: (type: keyof UsageStats) => { allowed: boolean; message?: string };
  getUsagePercentage: (type: keyof UsageStats) => number;
}

export const useSubscriptionLimits = (): SubscriptionLimitsData => {
  const { user } = useAuth();
  const [usage, setUsage] = useState<UsageStats>({
    products: 0,
    media: 0,
    playlists: 0,
    qrCodes: 0,
    slideshows: 0
  });
  const [isLoading, setIsLoading] = useState(true);

  const userTier = user?.subscriptionTier || user?.subscription_tier || 'free';
  
  // Get limits - check for admin-set custom limits first, then fall back to subscription tier defaults
  const tierLimits = SUBSCRIPTION_TIERS[userTier]?.limits || SUBSCRIPTION_TIERS.free.limits;
  
  const limits = {
    maxProducts: user?.maxProducts ?? tierLimits.maxProducts,
    maxAudioFiles: user?.maxAudioFiles ?? tierLimits.maxAudioFiles,
    maxQrCodes: user?.maxQrCodes ?? tierLimits.maxQrCodes,
    maxSlideshows: user?.maxSlideshows ?? tierLimits.maxSlideshows,
    maxVideos: user?.maxVideos ?? tierLimits.maxVideos,
    canEditPlaylists: tierLimits.canEditPlaylists, // This is tier-based, not admin-configurable
  };

  const fetchUsage = async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      // Fetch user's current usage from various endpoints
      const [productsRes, mediaRes, playlistsRes] = await Promise.all([
        api.get('/products?mine=true'),
        api.get('/media?mine=true'),
        api.get('/playlists')
      ]);

      setUsage({
        products: productsRes.data.products?.length || 0,
        media: mediaRes.data.media?.length || 0,
        playlists: playlistsRes.data.playlists?.length || 0,
        qrCodes: 0, // TODO: Add QR codes endpoint
        slideshows: 0 // TODO: Add slideshows endpoint
      });
    } catch (error) {
      console.error('Error fetching usage stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const canCreate = (type: keyof UsageStats) => {
    const current = usage[type];
    let limit: number;
    let contentName: string;

    switch (type) {
      case 'products':
        limit = limits.maxProducts;
        contentName = 'products';
        break;
      case 'media':
        limit = limits.maxAudioFiles;
        contentName = 'audio files';
        break;
      case 'playlists':
        limit = userTier === 'premium' ? 50 : userTier === 'basic' ? 25 : 10;
        contentName = 'playlists';
        break;
      case 'qrCodes':
        limit = limits.maxQrCodes;
        contentName = 'QR codes';
        break;
      case 'slideshows':
        limit = limits.maxSlideshows;
        contentName = 'slideshows';
        break;
      default:
        return { allowed: false, message: 'Unknown content type' };
    }

    const allowed = current < limit;
    
    return {
      allowed,
      message: allowed 
        ? undefined 
        : `You have reached your ${contentName} limit (${limit}) for the ${userTier} plan. Please upgrade your subscription to create more ${contentName}.`
    };
  };

  const getUsagePercentage = (type: keyof UsageStats): number => {
    const current = usage[type];
    let limit: number;

    switch (type) {
      case 'products':
        limit = limits.maxProducts;
        break;
      case 'media':
        limit = limits.maxAudioFiles;
        break;
      case 'playlists':
        limit = userTier === 'premium' ? 50 : userTier === 'basic' ? 25 : 10;
        break;
      case 'qrCodes':
        limit = limits.maxQrCodes;
        break;
      case 'slideshows':
        limit = limits.maxSlideshows;
        break;
      default:
        return 0;
    }

    return limit > 0 ? Math.min(100, Math.round((current / limit) * 100)) : 0;
  };

  useEffect(() => {
    fetchUsage();
  }, [user]);

  return {
    tier: userTier,
    limits: {
      ...limits,
      maxPlaylists: userTier === 'premium' ? 50 : userTier === 'basic' ? 25 : 10
    },
    usage,
    isLoading,
    refresh: fetchUsage,
    canCreate,
    getUsagePercentage
  };
};

export default useSubscriptionLimits; 