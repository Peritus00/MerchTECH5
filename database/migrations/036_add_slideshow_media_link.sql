-- Migration 036: Add slideshow_id to media table for slideshow-as-media-item support
-- Allows slideshows to appear as media items in playlists and media library

ALTER TABLE media ADD COLUMN IF NOT EXISTS slideshow_id INTEGER REFERENCES slideshows(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_media_slideshow_id ON media(slideshow_id) WHERE slideshow_id IS NOT NULL;

-- Unique constraint: one media row per slideshow
CREATE UNIQUE INDEX IF NOT EXISTS idx_media_slideshow_unique ON media(slideshow_id) WHERE slideshow_id IS NOT NULL;

COMMENT ON COLUMN media.slideshow_id IS 'Links media row to slideshow for playlist slideshow items';
