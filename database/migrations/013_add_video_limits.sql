-- Migration to add video file limits to users table
-- This adds proper video file limit tracking separate from audio files

-- Add max_video_files column if it doesn't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS max_video_files INTEGER DEFAULT NULL;

-- Add comment to document the video limits
COMMENT ON COLUMN users.max_video_files IS 'Maximum number of video files allowed for this user (NULL = use subscription tier default)';

-- Add index for better performance on video limit queries
CREATE INDEX IF NOT EXISTS idx_users_max_video_files ON users(max_video_files); 