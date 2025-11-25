-- Add soft delete column to activation_codes table
-- This enables admin restore functionality for accidentally deleted activation codes

-- Add deleted_at column to activation_codes table
ALTER TABLE activation_codes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL;

-- Add index for efficient querying of deleted items
CREATE INDEX IF NOT EXISTS idx_activation_codes_deleted_at ON activation_codes(deleted_at);

-- Add index for filtering active activation codes (deleted_at IS NULL)
CREATE INDEX IF NOT EXISTS idx_activation_codes_active ON activation_codes(created_by) WHERE deleted_at IS NULL;

