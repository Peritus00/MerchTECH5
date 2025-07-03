-- Add slideshow_id column to product_links for linking products to slideshows
ALTER TABLE IF NOT EXISTS product_links
  ADD COLUMN IF NOT EXISTS slideshow_id INTEGER REFERENCES slideshows(id) ON DELETE CASCADE;

-- Ensure uniqueness per slideshow/product combination
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'product_links_unique_slideshow_product') THEN
    ALTER TABLE product_links
      ADD CONSTRAINT product_links_unique_slideshow_product UNIQUE (slideshow_id, product_id);
  END IF;
END $$; 