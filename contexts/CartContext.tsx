import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { analyticsService } from '@/services/analyticsService';
import { getSessionId } from '@/utils/sessionTracking';
import { Product, CartItem } from '../shared/product-schema';
import { ProductVariantOptions } from '@/utils/productVariants';

interface CartContextType {
  cart: CartItem[];
  addToCart: (product: Product, options?: ProductVariantOptions) => void;
  removeFromCart: (productId: number | string, options?: ProductVariantOptions) => void;
  updateQuantity: (
    productId: number | string,
    quantity: number,
    options?: ProductVariantOptions
  ) => void;
  clearCart: () => void;
  getTotalPrice: () => number;
  getTotalItems: () => number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cart, setCart] = useState<CartItem[]>([]);

  // Load cart from storage on app start
  useEffect(() => {
    loadCart();
  }, []);

  // Save cart to storage whenever it changes
  useEffect(() => {
    saveCart();
  }, [cart]);

  const loadCart = async () => {
    try {
      const savedCart = await AsyncStorage.getItem('shopping_cart');
      if (savedCart) {
        setCart(JSON.parse(savedCart));
      }
    } catch (error) {
      console.error('Error loading cart:', error);
    }
  };

  const saveCart = async () => {
    try {
      await AsyncStorage.setItem('shopping_cart', JSON.stringify(cart));
    } catch (error) {
      console.error('Error saving cart:', error);
    }
  };

  const addToCart = async (product: Product, options?: ProductVariantOptions) => {
    const size = options?.size;
    const color = options?.color;
    // Check if product is in stock (handle both field name formats)
    const isInStock = product.inStock ?? product.in_stock ?? true;
    if (!isInStock) {
      console.log('🚫 Cannot add out of stock product to cart:', product.name);
      return;
    }

    // Track cart addition for analytics
    try {
      const sessionId = await getSessionId();
      await analyticsService.trackCartAdd(product.id, 1, sessionId);
    } catch (error) {
      console.error('Error tracking cart addition:', error);
      // Don't block cart addition if analytics fails
    }

    setCart(prevCart => {
      const existingItemIndex = prevCart.findIndex(
        (item) =>
          item.product.id === product.id && item.size === size && item.color === color
      );

      if (existingItemIndex !== -1) {
        // Update quantity of existing item
        const updatedCart = [...prevCart];
        updatedCart[existingItemIndex].quantity += 1;
        return updatedCart;
      } else {
        // Add new item to cart
        return [...prevCart, { product, quantity: 1, size, color }];
      }
    });
  };

  const matchesVariant = (
    item: CartItem,
    productId: number | string,
    size?: string,
    color?: string
  ) =>
    String(item.product.id) === String(productId) &&
    item.size === size &&
    item.color === color;

  const removeFromCart = (productId: number | string, options?: ProductVariantOptions) => {
    const size = options?.size;
    const color = options?.color;
    setCart((prevCart) =>
      prevCart.filter((item) => !matchesVariant(item, productId, size, color))
    );
  };

  const updateQuantity = (
    productId: number | string,
    quantity: number,
    options?: ProductVariantOptions
  ) => {
    const size = options?.size;
    const color = options?.color;
    if (quantity <= 0) {
      removeFromCart(productId, { size, color });
      return;
    }

    setCart((prevCart) =>
      prevCart.map((item) =>
        matchesVariant(item, productId, size, color) ? { ...item, quantity } : item
      )
    );
  };

  const clearCart = useCallback(() => {
    setCart([]);
  }, []);

  const getUnitPrice = (p: Product): number => {
    if (p.prices && p.prices.length) return p.prices[0].unit_amount;
    if (p.metadata && (p.metadata.price || p.metadata.unit_amount)) {
      return Number(p.metadata.price || p.metadata.unit_amount);
    }
    if (p.price) return p.price;
    return 0;
  };

  const getTotalPrice = useCallback(() => {
    return cart.reduce((total, item) => {
      const price = getUnitPrice(item.product);
      return total + price * item.quantity;
    }, 0);
  }, [cart]);

  const getTotalItems = useCallback(() => {
    return cart.reduce((total, item) => total + item.quantity, 0);
  }, [cart]);

  const value: CartContextType = {
    cart,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    getTotalPrice,
    getTotalItems,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export const useCart = (): CartContextType => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
