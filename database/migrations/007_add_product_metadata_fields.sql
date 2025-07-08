-- Add missing columns to products table for Stripe integration
ALTER TABLE products ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS stripe_product_id VARCHAR(255);
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;

-- Add missing columns to users table for admin permissions
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS max_products INTEGER DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS max_audio_files INTEGER DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS max_playlists INTEGER DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS max_qr_codes INTEGER DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS max_slideshows INTEGER DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS max_videos INTEGER DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS max_activation_codes INTEGER DEFAULT NULL;

-- Add missing columns to qr_codes table
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS playlist_id INTEGER REFERENCES playlists(id) ON DELETE SET NULL;
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS slideshow_id INTEGER REFERENCES slideshows(id) ON DELETE SET NULL;
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Add missing columns to slideshows table
ALTER TABLE slideshows ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE;
ALTER TABLE slideshows ADD COLUMN IF NOT EXISTS audio_url TEXT;

-- Add missing columns to playlists table
ALTER TABLE playlists ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE;

-- Add missing columns to activation_codes table
ALTER TABLE activation_codes ADD COLUMN IF NOT EXISTS used_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE activation_codes ADD COLUMN IF NOT EXISTS used_at TIMESTAMP DEFAULT NULL; 