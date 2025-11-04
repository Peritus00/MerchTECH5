-- Add gender column to media plays tables

-- Add gender column to media_plays table
ALTER TABLE media_plays ADD COLUMN IF NOT EXISTS user_provided_gender TEXT;

-- Add gender column to playlist_plays table
ALTER TABLE playlist_plays ADD COLUMN IF NOT EXISTS user_provided_gender TEXT;

-- Add gender column to slideshow_plays table
ALTER TABLE slideshow_plays ADD COLUMN IF NOT EXISTS user_provided_gender TEXT;

-- Create index for better performance on gender queries
CREATE INDEX IF NOT EXISTS idx_media_plays_gender ON media_plays(user_provided_gender) WHERE user_provided_gender IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_playlist_plays_gender ON playlist_plays(user_provided_gender) WHERE user_provided_gender IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_slideshow_plays_gender ON slideshow_plays(user_provided_gender) WHERE user_provided_gender IS NOT NULL;

