-- Migration to add missing columns to slideshows table
-- This adds the columns needed for slide duration and access control functionality

-- First rename owner_id to user_id for consistency with backend code
ALTER TABLE slideshows RENAME COLUMN IF EXISTS owner_id TO user_id;

-- Add missing columns to slideshows table
ALTER TABLE slideshows 
  ADD COLUMN IF NOT EXISTS autoplay_interval INTEGER DEFAULT 5000,
  ADD COLUMN IF NOT EXISTS transition VARCHAR(32) DEFAULT 'fade',
  ADD COLUMN IF NOT EXISTS requires_activation_code BOOLEAN DEFAULT FALSE;

-- Rename title to name for consistency with frontend/backend code
ALTER TABLE slideshows RENAME COLUMN IF EXISTS title TO name;

-- Add index for better performance on access control queries
CREATE INDEX IF NOT EXISTS idx_slideshows_requires_activation_code ON slideshows(requires_activation_code);

-- Update the existing index to use user_id instead of owner_id
DROP INDEX IF EXISTS idx_slideshows_owner_id;
CREATE INDEX IF NOT EXISTS idx_slideshows_user_id ON slideshows(user_id);

-- Update any existing slideshows to have default values
UPDATE slideshows 
SET autoplay_interval = 5000,
    transition = 'fade',
    requires_activation_code = FALSE
WHERE autoplay_interval IS NULL 
   OR transition IS NULL 
   OR requires_activation_code IS NULL; 