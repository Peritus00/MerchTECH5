-- User Demographics Columns
-- Add age_range and gender to users table for authenticated users

-- Add demographics columns to users table
ALTER TABLE IF EXISTS users
  ADD COLUMN IF NOT EXISTS age_range TEXT,
  ADD COLUMN IF NOT EXISTS gender TEXT;

-- Create indexes for demographic queries
CREATE INDEX IF NOT EXISTS idx_users_age_range 
  ON users(age_range) 
  WHERE age_range IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_gender 
  ON users(gender) 
  WHERE gender IS NOT NULL;

-- Add comments explaining the columns
COMMENT ON COLUMN users.age_range IS 
  'User age range (e.g., "18-24", "25-34") for demographic analytics';

COMMENT ON COLUMN users.gender IS 
  'User gender identity (Male, Female, Non-binary, Prefer not to say, Open-ended) for demographic analytics';

