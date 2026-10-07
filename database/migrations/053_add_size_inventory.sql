-- Document per-size inventory stored in products.metadata.sizeInventory
COMMENT ON COLUMN products.metadata IS 'JSONB metadata including hasSizes, availableSizes, sizeInventory (per-size quantities), hasColors, availableColors';
