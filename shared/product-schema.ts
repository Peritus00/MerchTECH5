
export interface Product {
  id: number;
  userId?: number;
  name: string;
  description: string;
  price: number; // Price in cents
  imageUrl: string;
  category: string;
  inStock: boolean;
  slug: string;
  tags?: string[];
  externalUrl?: string;
  hasSizes: boolean;
  availableSizes?: string[];
  isSuspended: boolean;
  createdAt: string;
  updatedAt?: string;
  creator?: {
    username: string;
  };
}

export interface ProductRating {
  id: number;
  productId: number;
  userId: number;
  rating: number; // 1-5 stars
  review?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
  size?: string;
}
