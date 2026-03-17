-- Add per-playlist phone gate for preview access
ALTER TABLE playlists ADD COLUMN IF NOT EXISTS require_phone_for_preview BOOLEAN NOT NULL DEFAULT false;
