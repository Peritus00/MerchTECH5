
export interface Product {
  id: string; // Changed to string for Stripe Product ID (prod_...)
  userId?: number;
  user_id?: number; // API returns this field
  name: string;
  description: string;
  price?: number; // Deprecated - use prices array instead
  imageUrl?: string;
  images?: string[]; // Stripe product images
  category?: string;
  in_stock?: boolean;
  slug?: string;
  tags?: string[];
  externalUrl?: string;
  hasSizes?: boolean;
  availableSizes?: string[];
  isSuspended?: boolean;
  createdAt?: string;
  updatedAt?: string;
  creator?: {
    username: string;
  };
  metadata?: Record<string, string>; // Stripe metadata
  prices: ProductPrice[]; // Stripe prices for this product
}

export interface ProductPrice {
  id: string; // Stripe Price ID (price_...)
  unit_amount: number; // Amount in cents
  currency: string;
  type: 'one_time' | 'recurring';
  recurring?: {
    interval: 'day' | 'week' | 'month' | 'year';
    interval_count: number;
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
