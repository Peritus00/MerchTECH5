
export interface MediaFile {
  id: number;
  userId?: number;
  uniqueId: string;
  title: string;
  fileType: string;
  filePath: string;
  url?: string;
  meta?: any;
  createdAt: string;
  updatedAt?: string;
  filename?: string;
  filesize?: number;
  contentType?: string;
  path?: string;
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
