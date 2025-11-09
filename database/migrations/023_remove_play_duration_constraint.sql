-- Remove the play_duration >= 30 constraint from media_plays table
-- This allows tracking all play durations, not just those >= 30 seconds
-- The query logic already handles filtering for unique plays (>30s) correctly

ALTER TABLE media_plays DROP CONSTRAINT IF EXISTS media_plays_duration_check;

-- Note: The query in /api/analytics/media-items-stats already correctly handles:
-- - Total Plays: COUNT(mp.id) - counts all plays regardless of duration
-- - Unique Plays: COUNT(DISTINCT CASE WHEN mp.play_duration > 30 ...) - only counts plays > 30s

