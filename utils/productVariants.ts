import { Product } from '@/shared/product-schema';

export type ProductVariantOptions = {
  size?: string;
  color?: string;
};

export function parseProductMetadata(raw: Product['metadata']): NonNullable<Product['metadata']> {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw)) as NonNullable<Product['metadata']>;
  } catch {
    return {};
  }
}

export function getSizesWithStock(meta: NonNullable<Product['metadata']>): string[] {
  if (!meta.hasSizes || !meta.availableSizes?.length) return [];
  const sizeInventory = meta.sizeInventory || {};
  return meta.availableSizes.filter((size) => (Number(sizeInventory[size]) || 0) > 0);
}

export function getColorsWithStock(meta: NonNullable<Product['metadata']>): string[] {
  if (!meta.hasColors || !meta.availableColors?.length) return [];
  const colorInventory = meta.colorInventory || {};
  return meta.availableColors.filter((color) => (Number(colorInventory[color]) || 0) > 0);
}

/** True when product metadata requires a size but cart line has none. */
export function cartItemMissingRequiredSize(item: { product: Product; size?: string }): boolean {
  const meta = parseProductMetadata(item.product.metadata);
  if (!meta.hasSizes || !meta.availableSizes?.length) return false;
  return !item.size;
}

/** True when product metadata requires a color but cart line has none. */
export function cartItemMissingRequiredColor(item: { product: Product; color?: string }): boolean {
  const meta = parseProductMetadata(item.product.metadata);
  if (!meta.hasColors || !meta.availableColors?.length) return false;
  return !item.color;
}

export function cartLineKey(productId: string | number, size?: string, color?: string): string {
  return `${productId}::${size ?? ''}::${color ?? ''}`;
}
