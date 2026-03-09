export interface MediaFile {
  id: string; // Can be a number or a string, so use string for flexibility
  url: string;
  type: 'image' | 'audio' | 'video'; // Explicitly define the media type
  title?: string; // Optional title
  caption?: string; // Optional caption, for images
  duration?: number; // Optional duration, for images in a slideshow (in ms)
  fileType?: string; // Retain for backward compatibility if needed
  contentType?: string; // Retain for backward compatibility if needed
  filename?: string;
  s3_key?: string;
  uploadStatus?: 'pending_scan' | 'scanning' | 'ready' | 'rejected';
  scanStatus?: 'pending' | 'clean' | 'infected' | 'failed' | 'skipped';
}

export interface ProductLink {
  id: number;
  linkId?: string; // Link ID for reference
  playlistId: string;
  title: string;
  url: string;
  description?: string;
  imageUrl?: string;
  images?: string[]; // Multiple images for carousel
  displayOrder: number;
  isActive: boolean;
  price?: string;
  originalPrice?: string;
  rating?: number; // 1-5 star rating
  reviewCount?: number;
  productName?: string; // Product name from JOIN with products table
  createdAt: string;
  updatedAt?: string;
}

export interface ChatMessage {
  id: number;
  playlistId: number;
  userId: number;
  username: string;
  message: string;
  createdAt: string;
  updatedAt?: string;
  isDeleted: boolean;
}

export interface Playlist {
  id: string;
  userId?: number;
  name: string;
  requiresActivationCode: boolean;
  isPublic: boolean;
  instagramUrl?: string;
  twitterUrl?: string;
  facebookUrl?: string;
  youtubeUrl?: string;
  websiteUrl?: string;
  productLink?: string;
  productLinkTitle?: string;
  createdAt: string;
  updatedAt?: string;
  mediaFiles: MediaFile[];
  productLinks?: ProductLink[];
  chatMessages?: ChatMessage[];
}

export interface Slideshow {
  id: number;
  userId?: number;
  uniqueId: string;
  name: string;
  description?: string;
  audioUrl?: string;
  autoplayInterval: number;
  transition: string;
  requiresActivationCode: boolean;
  createdAt: string;
  images: SlideshowImage[];
}

export interface SlideshowImage {
  id: number;
  slideshowId: number;
  url: string;
  caption?: string;
  position: number;
  createdAt: string;
}

export interface ActivationCode {
  id: number;
  code: string;
  playlistId: string;
  maxUses: number | null;
  usesCount: number;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}
