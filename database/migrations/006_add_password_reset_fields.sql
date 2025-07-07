ALTER TABLE users
ADD COLUMN password_reset_token TEXT,
ADD COLUMN password_reset_expires TIMESTAMPTZ;

-- Optional: Create an index on the reset token for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_password_reset_token ON users(password_reset_token); 