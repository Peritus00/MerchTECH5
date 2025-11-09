-- Remove the play_duration >= 30 constraint from media_plays table
-- This allows tracking all plays regardless of duration
-- Total Plays will count all plays, Unique Plays will still require >30 seconds

ALTER TABLE media_plays DROP CONSTRAINT IF EXISTS media_plays_duration_check;

-- Add a new constraint that allows any non-negative duration
ALTER TABLE media_plays ADD CONSTRAINT media_plays_duration_check CHECK (play_duration >= 0);

