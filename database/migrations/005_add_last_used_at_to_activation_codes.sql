-- Migration to add last_used_at column to activation_codes table
-- This column tracks when an activation code was last used

ALTER TABLE activation_codes 
ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP DEFAULT NULL;

-- Add index for better performance on usage tracking queries
CREATE INDEX IF NOT EXISTS idx_activation_codes_last_used_at ON activation_codes(last_used_at); 