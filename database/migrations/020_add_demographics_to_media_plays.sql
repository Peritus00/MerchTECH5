-- Add demographics (age and location) columns to media plays tables

-- Add demographics columns to media_plays table
ALTER TABLE media_plays ADD COLUMN IF NOT EXISTS user_provided_age_range TEXT;
ALTER TABLE media_plays ADD COLUMN IF NOT EXISTS user_provided_city TEXT;
ALTER TABLE media_plays ADD COLUMN IF NOT EXISTS user_provided_state TEXT;
ALTER TABLE media_plays ADD COLUMN IF NOT EXISTS user_provided_zip TEXT;
ALTER TABLE media_plays ADD COLUMN IF NOT EXISTS location_source TEXT;

-- Add demographics columns to playlist_plays table
ALTER TABLE playlist_plays ADD COLUMN IF NOT EXISTS user_provided_age_range TEXT;
ALTER TABLE playlist_plays ADD COLUMN IF NOT EXISTS user_provided_city TEXT;
ALTER TABLE playlist_plays ADD COLUMN IF NOT EXISTS user_provided_state TEXT;
ALTER TABLE playlist_plays ADD COLUMN IF NOT EXISTS user_provided_zip TEXT;
ALTER TABLE playlist_plays ADD COLUMN IF NOT EXISTS location_source TEXT;

-- Add demographics columns to slideshow_plays table
ALTER TABLE slideshow_plays ADD COLUMN IF NOT EXISTS user_provided_age_range TEXT;
ALTER TABLE slideshow_plays ADD COLUMN IF NOT EXISTS user_provided_city TEXT;
ALTER TABLE slideshow_plays ADD COLUMN IF NOT EXISTS user_provided_state TEXT;
ALTER TABLE slideshow_plays ADD COLUMN IF NOT EXISTS user_provided_zip TEXT;
ALTER TABLE slideshow_plays ADD COLUMN IF NOT EXISTS location_source TEXT;

-- Create indexes for better performance on demographics queries
CREATE INDEX IF NOT EXISTS idx_media_plays_age_range ON media_plays(user_provided_age_range) WHERE user_provided_age_range IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_media_plays_location ON media_plays(user_provided_city, user_provided_state) WHERE user_provided_city IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_media_plays_location_source ON media_plays(location_source) WHERE location_source IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_playlist_plays_age_range ON playlist_plays(user_provided_age_range) WHERE user_provided_age_range IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_playlist_plays_location ON playlist_plays(user_provided_city, user_provided_state) WHERE user_provided_city IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_playlist_plays_location_source ON playlist_plays(location_source) WHERE location_source IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_slideshow_plays_age_range ON slideshow_plays(user_provided_age_range) WHERE user_provided_age_range IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_slideshow_plays_location ON slideshow_plays(user_provided_city, user_provided_state) WHERE user_provided_city IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_slideshow_plays_location_source ON slideshow_plays(location_source) WHERE location_source IS NOT NULL;

