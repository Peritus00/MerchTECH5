
export interface SubscriptionTier {
  id: string;
  name: string;
  price: number; // Monthly price in dollars
  stripePriceId: string;
  description: string;
  features: string[];
  limits: {
    maxQrCodes: number;
    maxSlideshows: number;
    maxVideos: number;
    maxAudioFiles: number;
    maxProducts: number;
    canEditPlaylists: boolean;
  };
  popular?: boolean;
}

export const SUBSCRIPTION_TIERS: Record<string, SubscriptionTier> = {
  free: {
    id: "free",
    name: "Free",
    price: 0,
    stripePriceId: "",
    description: "Perfect for getting started",
    features: [
      "1 QR code",
      "3 audio tracks", 
      "1 product",
      "No video uploads",
      "No slideshows"
    ],
    limits: {
      maxQrCodes: 1,
      maxSlideshows: 0,
      maxVideos: 0,
      maxAudioFiles: 3,
      maxProducts: 1,
      canEditPlaylists: false
    }
  },
  basic: {
    id: "basic",
    name: "Basic",
    price: 15.00,
    stripePriceId: "price_basic_monthly",
    description: "Great for small businesses",
    features: [
      "3 QR codes",
      "3 slideshows",
      "1 video upload",
      "10 audio tracks",
      "3 products",
      "Email support"
    ],
    limits: {
      maxQrCodes: 3,
      maxSlideshows: 3,
      maxVideos: 1,
      maxAudioFiles: 10,
      maxProducts: 3,
      canEditPlaylists: false
    },
    popular: true
  },
  premium: {
    id: "premium",
    name: "Premium", 
    price: 40.00,
    stripePriceId: "price_premium_monthly",
    description: "For power users and agencies",
    features: [
      "10 QR codes",
      "5 slideshows",
      "3 video uploads",
      "20 audio tracks",
      "10 products",
      "Playlist editing after creation",
      "Priority support"
    ],
    limits: {
      maxQrCodes: 10,
      maxSlideshows: 5,
      maxVideos: 3,
      maxAudioFiles: 20,
      maxProducts: 10,
      canEditPlaylists: true
    }
  }
};
