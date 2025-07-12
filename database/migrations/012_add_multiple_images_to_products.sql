-- Migration to add multiple images support to products table
-- This replaces the single image_url field with an images TEXT[] array

-- Add images column if it doesn't exist
ALTER TABLE products ADD COLUMN IF NOT EXISTS images TEXT[];

-- Migrate existing image_url data to images array (only if image_url column exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'image_url') THEN
    UPDATE products 
    SET images = ARRAY[image_url] 
    WHERE image_url IS NOT NULL AND (images IS NULL OR array_length(images, 1) IS NULL);
    
    -- Drop the old image_url column after migration
    ALTER TABLE products DROP COLUMN image_url;
  END IF;
END $$;

-- Add price column as integer (cents) if it doesn't exist
ALTER TABLE products ADD COLUMN IF NOT EXISTS price INTEGER;

-- Add other missing columns for full product support
ALTER TABLE products ADD COLUMN IF NOT EXISTS category VARCHAR(100);
ALTER TABLE products ADD COLUMN IF NOT EXISTS in_stock BOOLEAN DEFAULT true;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS prices JSONB;
ALTER TABLE products ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS stripe_product_id VARCHAR(255);

-- Convert existing decimal price to integer cents if needed
-- This handles cases where price might be stored as decimal
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'price' AND data_type = 'numeric') THEN
    -- Convert decimal to integer cents
    UPDATE products 
    SET price = ROUND(price * 100)::INTEGER 
    WHERE price IS NOT NULL AND price < 1000; -- Only convert if it looks like a dollar amount
    
    -- Change column type to integer
    ALTER TABLE products ALTER COLUMN price TYPE INTEGER USING price::INTEGER;
  END IF;
END $$;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_products_images ON products USING GIN(images);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_in_stock ON products(in_stock);
CREATE INDEX IF NOT EXISTS idx_products_is_deleted ON products(is_deleted);

-- Add comment to document the images field
COMMENT ON COLUMN products.images IS 'Array of image URLs for product gallery'; 