-- Add social login fields to users table
-- This migration adds support for Google and Apple Sign-In

-- Make password_hash nullable (social login users don't have passwords)
ALTER TABLE users 
  ALTER COLUMN password_hash DROP NOT NULL;

-- Add Google ID column with unique constraint
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE;

-- Add Apple ID column with unique constraint  
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS apple_id VARCHAR(255) UNIQUE;

-- Add provider metadata column for storing additional OAuth data
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS provider_metadata JSONB DEFAULT '{}';

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_apple_id ON users(apple_id) WHERE apple_id IS NOT NULL;

-- Add comments explaining the columns
COMMENT ON COLUMN users.google_id IS 'Google user ID from Google Sign-In OAuth flow';
COMMENT ON COLUMN users.apple_id IS 'Apple user ID from Sign in with Apple OAuth flow';
COMMENT ON COLUMN users.provider_metadata IS 'JSON metadata from OAuth providers (e.g., profile picture, name, etc.)';
COMMENT ON COLUMN users.password_hash IS 'Bcrypt hash of user password (nullable for social login users)';

-- Add constraint to ensure users have at least one authentication method
-- A user must have either password_hash OR (google_id OR apple_id)
-- Note: This is enforced at application level, not database level, for flexibility

