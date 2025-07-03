-- Add audio_url column to slideshows so background music can be persisted
ALTER TABLE slideshows
  ADD COLUMN IF NOT EXISTS audio_url TEXT; 