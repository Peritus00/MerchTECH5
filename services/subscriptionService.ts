import { SUBSCRIPTION_TIERS } from '@/types/subscription';

export interface SubscriptionLimits {
  maxQrCodes: number;
  maxSlideshows: number;
  maxVideos: number;
  maxAudioFiles: number;
  maxProducts: number;
  canEditPlaylists: boolean;
}

export class SubscriptionService {
  /**
   * Get the limits for a specific subscription tier
   */
  static getLimits(tier: string): SubscriptionLimits {
    const subscriptionTier = SUBSCRIPTION_TIERS[tier] || SUBSCRIPTION_TIERS.free;
    return subscriptionTier.limits;
  }

  /**
   * Check if a user can perform an action based on their current usage and subscription limits
   */
  static async canCreateContent(
    userId: number,
    contentType: 'products' | 'media' | 'playlists' | 'slideshows' | 'qr_codes',
    userTier: string,
    currentCount: number
  ): Promise<{ allowed: boolean; limit: number; current: number; message?: string }> {
    const limits = this.getLimits(userTier);
    
    let limit: number;
    let contentName: string;

    switch (contentType) {
      case 'products':
        limit = limits.maxProducts;
        contentName = 'products';
        break;
      case 'media':
        limit = limits.maxAudioFiles; // For now, treating all media as audio
        contentName = 'audio files';
        break;
      case 'slideshows':
        limit = limits.maxSlideshows;
        contentName = 'slideshows';
        break;
      case 'qr_codes':
        limit = limits.maxQrCodes;
        contentName = 'QR codes';
        break;
      case 'playlists':
        // Playlists have a reasonable limit based on tier
        limit = userTier === 'premium' ? 50 : userTier === 'basic' ? 25 : 10;
        contentName = 'playlists';
        break;
      default:
        return { allowed: false, limit: 0, current: currentCount, message: 'Unknown content type' };
    }

    const allowed = currentCount < limit;
    
    return {
      allowed,
      limit,
      current: currentCount,
      message: allowed 
        ? undefined 
        : `You have reached your ${contentName} limit (${limit}) for the ${userTier} plan. Please upgrade your subscription to create more ${contentName}.`
    };
  }

  /**
   * Check if a user can edit playlists based on their subscription tier
   */
  static canEditPlaylists(userTier: string): boolean {
    const limits = this.getLimits(userTier);
    return limits.canEditPlaylists;
  }

  /**
   * Get upgrade message for a specific feature
   */
  static getUpgradeMessage(feature: string, currentTier: string): string {
    const nextTier = currentTier === 'free' ? 'basic' : 'premium';
    return `This feature requires a ${nextTier} subscription. Please upgrade your plan to access ${feature}.`;
  }

  /**
   * Get a summary of what a user gets with their current plan
   */
  static getPlanSummary(tier: string): string {
    const limits = this.getLimits(tier);
    const tierInfo = SUBSCRIPTION_TIERS[tier] || SUBSCRIPTION_TIERS.free;
    
    return `${tierInfo.name} Plan: ${limits.maxProducts} products, ${limits.maxAudioFiles} audio files, ${limits.maxQrCodes} QR codes, ${limits.maxSlideshows} slideshows`;
  }
}

export default SubscriptionService; 