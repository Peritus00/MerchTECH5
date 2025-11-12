-- Add soft delete columns to playlists and slideshows tables
-- This enables admin restore functionality for accidentally deleted items

-- Add deleted_at column to playlists table
ALTER TABLE playlists ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL;

-- Add deleted_at column to slideshows table
ALTER TABLE slideshows ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL;

-- Add indexes for efficient querying of deleted items
CREATE INDEX IF NOT EXISTS idx_playlists_deleted_at ON playlists(deleted_at);
CREATE INDEX IF NOT EXISTS idx_slideshows_deleted_at ON slideshows(deleted_at);

-- Add index for filtering active playlists (deleted_at IS NULL)
CREATE INDEX IF NOT EXISTS idx_playlists_active ON playlists(user_id) WHERE deleted_at IS NULL;

-- Add index for filtering active slideshows (deleted_at IS NULL)
CREATE INDEX IF NOT EXISTS idx_slideshows_active ON slideshows(user_id) WHERE deleted_at IS NULL;

