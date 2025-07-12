-- Migration to add QR code image URL and other missing columns
-- This ensures QR codes can be properly stored in S3

-- Add missing columns to qr_codes table
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS qr_code_image_url TEXT;
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS playlist_id INTEGER REFERENCES playlists(id) ON DELETE SET NULL;
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS slideshow_id INTEGER REFERENCES slideshows(id) ON DELETE SET NULL;
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Update owner_id to user_id if owner_id column exists
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'qr_codes' AND column_name = 'owner_id') THEN
    -- Copy data from owner_id to user_id
    UPDATE qr_codes SET user_id = owner_id WHERE user_id IS NULL;
    
    -- Drop the old column
    ALTER TABLE qr_codes DROP COLUMN IF EXISTS owner_id;
  END IF;
END $$;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_qr_codes_user_id ON qr_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_qr_codes_playlist_id ON qr_codes(playlist_id);
CREATE INDEX IF NOT EXISTS idx_qr_codes_slideshow_id ON qr_codes(slideshow_id);
CREATE INDEX IF NOT EXISTS idx_qr_codes_active ON qr_codes(is_active);

-- Ensure all existing QR codes have the is_active column set to true
UPDATE qr_codes SET is_active = true WHERE is_active IS NULL; 