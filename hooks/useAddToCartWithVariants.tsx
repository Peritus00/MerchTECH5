import React, { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';
import SizeSelectorModal from '@/components/SizeSelectorModal';
import { useCart } from '@/contexts/CartContext';
import { productsAPI } from '@/services/api';
import { Product } from '@/shared/product-schema';
import {
  getColorsWithStock,
  getSizesWithStock,
  parseProductMetadata,
} from '@/utils/productVariants';

type AddInput = Product | string | number;

export function useAddToCartWithVariants(options?: {
  onAdded?: (productName: string) => void;
}) {
  const { addToCart } = useCart();
  const onAdded = options?.onAdded;
  const pendingQuantityRef = useRef(1);
  const [sizeVisible, setSizeVisible] = useState(false);
  const [colorVisible, setColorVisible] = useState(false);
  const [productName, setProductName] = useState('');
  const [sizes, setSizes] = useState<string[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const [pendingProduct, setPendingProduct] = useState<Product | null>(null);
  const [pendingSize, setPendingSize] = useState<string | undefined>();

  const commitAdd = useCallback(
    (product: Product, size?: string, color?: string) => {
      const qty = pendingQuantityRef.current;
      for (let i = 0; i < qty; i++) {
        addToCart(product, { size, color });
      }
      onAdded?.(product.name);
    },
    [addToCart, onAdded]
  );

  const resetFlow = useCallback(() => {
    setPendingProduct(null);
    setPendingSize(undefined);
    setSizes([]);
    setColors([]);
    pendingQuantityRef.current = 1;
  }, []);

  const resolveProduct = useCallback(async (input: AddInput): Promise<Product> => {
    if (typeof input === 'object' && input !== null) {
      const meta = parseProductMetadata(input.metadata);
      const needsFetch =
        Object.keys(meta).length === 0 ||
        (meta.hasSizes && !meta.availableSizes?.length) ||
        (meta.hasColors && !meta.availableColors?.length);
      if (needsFetch) {
        const details = await productsAPI.getProductById(String(input.id));
        return (details.product || details) as Product;
      }
      return input;
    }
    const details = await productsAPI.getProductById(String(input));
    return (details.product || details) as Product;
  }, []);

  const startAddToCart = useCallback(
    async (input: AddInput, quantity = 1) => {
      pendingQuantityRef.current = Math.max(1, quantity);
      try {
        const product = await resolveProduct(input);
        const meta = parseProductMetadata(product.metadata);
        const sizesWithStock = getSizesWithStock(meta);
        const colorsWithStock = getColorsWithStock(meta);

        setProductName(product.name);

        if (sizesWithStock.length > 0) {
          setPendingProduct(product);
          setSizes(sizesWithStock);
          setSizeVisible(true);
          return;
        }
        if (meta.hasSizes && meta.availableSizes?.length) {
          Alert.alert('Out of Stock', 'This product is currently out of stock in all sizes.');
          resetFlow();
          return;
        }
        if (colorsWithStock.length > 0) {
          setPendingProduct(product);
          setColors(colorsWithStock);
          setColorVisible(true);
          return;
        }
        if (meta.hasColors && meta.availableColors?.length) {
          Alert.alert('Out of Stock', 'This product is currently out of stock in all colors.');
          resetFlow();
          return;
        }

        commitAdd(product);
        resetFlow();
      } catch (error) {
        console.error('Add to cart variant flow error:', error);
        Alert.alert('Error', 'Failed to add item to cart');
        resetFlow();
      }
    },
    [commitAdd, resetFlow, resolveProduct]
  );

  const onSizeSelected = useCallback(
    async (size: string) => {
      setSizeVisible(false);
      if (!pendingProduct) return;

      const meta = parseProductMetadata(pendingProduct.metadata);
      const colorsWithStock = getColorsWithStock(meta);

      if (colorsWithStock.length > 0) {
        setPendingSize(size);
        setColors(colorsWithStock);
        setColorVisible(true);
        return;
      }

      commitAdd(pendingProduct, size);
      resetFlow();
    },
    [commitAdd, pendingProduct, resetFlow]
  );

  const onColorSelected = useCallback(
    (color: string) => {
      setColorVisible(false);
      if (!pendingProduct) return;
      commitAdd(pendingProduct, pendingSize, color);
      resetFlow();
    },
    [commitAdd, pendingProduct, pendingSize, resetFlow]
  );

  const variantModals = (
    <>
      <SizeSelectorModal
        visible={sizeVisible}
        productName={productName}
        sizes={sizes}
        onSelectSize={onSizeSelected}
        onClose={() => {
          setSizeVisible(false);
          resetFlow();
        }}
      />
      <SizeSelectorModal
        visible={colorVisible}
        productName={productName}
        sizes={colors}
        title="Select Color"
        onSelectSize={onColorSelected}
        onClose={() => {
          setColorVisible(false);
          resetFlow();
        }}
      />
    </>
  );

  return {
    startAddToCart,
    variantModals,
  } as const;
}

export type UseAddToCartWithVariantsResult = ReturnType<typeof useAddToCartWithVariants>;
