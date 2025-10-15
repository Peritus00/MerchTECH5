-- Add analytics tracking tables and columns

-- Create media_plays table for tracking individual media playback events
CREATE TABLE IF NOT EXISTS media_plays (
  id SERIAL PRIMARY KEY,
  media_id INTEGER REFERENCES media(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  session_id VARCHAR(255) NOT NULL,
  play_duration INTEGER NOT NULL, -- in seconds
  played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ip_address INET,
  CONSTRAINT media_plays_duration_check CHECK (play_duration >= 30)
);

-- Create playlist_plays table for tracking playlist playback sessions
CREATE TABLE IF NOT EXISTS playlist_plays (
  id SERIAL PRIMARY KEY,
  playlist_id INTEGER REFERENCES playlists(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  session_id VARCHAR(255) NOT NULL,
  play_duration INTEGER NOT NULL, -- in seconds
  played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ip_address INET,
  CONSTRAINT playlist_plays_duration_check CHECK (play_duration >= 30)
);

-- Create slideshow_plays table for tracking slideshow playback sessions
CREATE TABLE IF NOT EXISTS slideshow_plays (
  id SERIAL PRIMARY KEY,
  slideshow_id INTEGER REFERENCES slideshows(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  session_id VARCHAR(255) NOT NULL,
  play_duration INTEGER NOT NULL, -- in seconds
  played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ip_address INET,
  CONSTRAINT slideshow_plays_duration_check CHECK (play_duration >= 30)
);

-- Create cart_events table for tracking cart additions
CREATE TABLE IF NOT EXISTS cart_events (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  session_id VARCHAR(255) NOT NULL,
  quantity INTEGER DEFAULT 1,
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create purchase_events table for tracking completed purchases
CREATE TABLE IF NOT EXISTS purchase_events (
  id SERIAL PRIMARY KEY,
  stripe_session_id VARCHAR(255) UNIQUE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  total_amount INTEGER, -- in cents
  items JSONB, -- store line items data
  purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add analytics columns to media table
ALTER TABLE media ADD COLUMN IF NOT EXISTS total_plays INTEGER DEFAULT 0;
ALTER TABLE media ADD COLUMN IF NOT EXISTS unique_plays INTEGER DEFAULT 0;

-- Add analytics columns to playlists table
ALTER TABLE playlists ADD COLUMN IF NOT EXISTS total_plays INTEGER DEFAULT 0;
ALTER TABLE playlists ADD COLUMN IF NOT EXISTS unique_plays INTEGER DEFAULT 0;
ALTER TABLE playlists ADD COLUMN IF NOT EXISTS times_created INTEGER DEFAULT 0;

-- Add analytics columns to slideshows table
ALTER TABLE slideshows ADD COLUMN IF NOT EXISTS total_plays INTEGER DEFAULT 0;
ALTER TABLE slideshows ADD COLUMN IF NOT EXISTS unique_plays INTEGER DEFAULT 0;
ALTER TABLE slideshows ADD COLUMN IF NOT EXISTS times_created INTEGER DEFAULT 0;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_media_plays_media_id ON media_plays(media_id);
CREATE INDEX IF NOT EXISTS idx_media_plays_session_id ON media_plays(session_id);
CREATE INDEX IF NOT EXISTS idx_media_plays_played_at ON media_plays(played_at);
CREATE INDEX IF NOT EXISTS idx_media_plays_user_id ON media_plays(user_id);

CREATE INDEX IF NOT EXISTS idx_playlist_plays_playlist_id ON playlist_plays(playlist_id);
CREATE INDEX IF NOT EXISTS idx_playlist_plays_session_id ON playlist_plays(session_id);
CREATE INDEX IF NOT EXISTS idx_playlist_plays_played_at ON playlist_plays(played_at);
CREATE INDEX IF NOT EXISTS idx_playlist_plays_user_id ON playlist_plays(user_id);

CREATE INDEX IF NOT EXISTS idx_slideshow_plays_slideshow_id ON slideshow_plays(slideshow_id);
CREATE INDEX IF NOT EXISTS idx_slideshow_plays_session_id ON slideshow_plays(session_id);
CREATE INDEX IF NOT EXISTS idx_slideshow_plays_played_at ON slideshow_plays(played_at);
CREATE INDEX IF NOT EXISTS idx_slideshow_plays_user_id ON slideshow_plays(user_id);

CREATE INDEX IF NOT EXISTS idx_cart_events_product_id ON cart_events(product_id);
CREATE INDEX IF NOT EXISTS idx_cart_events_session_id ON cart_events(session_id);
CREATE INDEX IF NOT EXISTS idx_cart_events_added_at ON cart_events(added_at);
CREATE INDEX IF NOT EXISTS idx_cart_events_user_id ON cart_events(user_id);

CREATE INDEX IF NOT EXISTS idx_purchase_events_stripe_session_id ON purchase_events(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_purchase_events_purchased_at ON purchase_events(purchased_at);
CREATE INDEX IF NOT EXISTS idx_purchase_events_user_id ON purchase_events(user_id);

