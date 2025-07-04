-- Create pending_users table for email verification
CREATE TABLE IF NOT EXISTS pending_users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(100),
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  verification_token VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(100),
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  subscription_tier VARCHAR(50) DEFAULT 'free',
  is_email_verified BOOLEAN DEFAULT FALSE,
  is_admin BOOLEAN DEFAULT false,
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  verification_token VARCHAR(500),
  is_new_user BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create QR codes table
CREATE TABLE IF NOT EXISTS qr_codes (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  qr_code_data TEXT NOT NULL,
  short_url VARCHAR(255),
  description TEXT,
  options JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create QR scans table for analytics
CREATE TABLE IF NOT EXISTS qr_scans (
  id SERIAL PRIMARY KEY,
  qr_code_id INTEGER REFERENCES qr_codes(id) ON DELETE CASCADE,
  scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  location VARCHAR(255),
  device VARCHAR(255),
  country_name VARCHAR(100),
  country_code VARCHAR(2),
  device_type VARCHAR(50),
  browser_name VARCHAR(100),
  operating_system VARCHAR(100),
  ip_address INET
);

-- Create products table
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10,2),
  image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create slideshows table
CREATE TABLE IF NOT EXISTS slideshows (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create slideshow images table
CREATE TABLE IF NOT EXISTS slideshow_images (
  id SERIAL PRIMARY KEY,
  slideshow_id INTEGER REFERENCES slideshows(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  caption TEXT,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create fanmail table
CREATE TABLE IF NOT EXISTS fanmail (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  qr_code_id INTEGER REFERENCES qr_codes(id) ON DELETE SET NULL,
  slideshow_id INTEGER REFERENCES slideshows(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT,
  status VARCHAR(20) DEFAULT 'unread',
  content_type VARCHAR(50),
  visitor_country VARCHAR(100),
  visitor_device VARCHAR(255),
  scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create media table for audio/video files
CREATE TABLE IF NOT EXISTS media (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  file_type VARCHAR(50) NOT NULL,
  content_type VARCHAR(100) NOT NULL,
  file_size INTEGER,
  data TEXT, -- Base64 encoded file data
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create playlists table
CREATE TABLE IF NOT EXISTS playlists (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  requires_activation_code BOOLEAN DEFAULT FALSE,
  is_public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create playlist_media table for many-to-many relationship
CREATE TABLE IF NOT EXISTS playlist_media (
  id SERIAL PRIMARY KEY,
  playlist_id INTEGER REFERENCES playlists(id) ON DELETE CASCADE,
  media_id INTEGER REFERENCES media(id) ON DELETE CASCADE,
  display_order INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(playlist_id, media_id)
);

-- Create activation_codes table
CREATE TABLE IF NOT EXISTS activation_codes (
  id SERIAL PRIMARY KEY,
  code VARCHAR(255) UNIQUE NOT NULL,
  playlist_id INTEGER REFERENCES playlists(id) ON DELETE CASCADE,
  slideshow_id INTEGER REFERENCES slideshows(id) ON DELETE CASCADE,
  created_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
  max_uses INTEGER DEFAULT NULL, -- NULL means unlimited
  uses_count INTEGER DEFAULT 0,
  expires_at TIMESTAMP DEFAULT NULL, -- NULL means no expiration
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- Ensure each code is for either a playlist OR slideshow, not both
  CONSTRAINT check_content_type CHECK (
    (playlist_id IS NOT NULL AND slideshow_id IS NULL) OR 
    (playlist_id IS NULL AND slideshow_id IS NOT NULL)
  )
);

-- Create user_activation_codes table (codes attached to user profiles)
CREATE TABLE IF NOT EXISTS user_activation_codes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  activation_code_id INTEGER REFERENCES activation_codes(id) ON DELETE CASCADE,
  attached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, activation_code_id)
);

-- Create achievement levels table
CREATE TABLE IF NOT EXISTS achievement_levels (
  id SERIAL PRIMARY KEY,
  level INTEGER UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  scans_required INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create user achievements table
CREATE TABLE IF NOT EXISTS user_achievements (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  achievement_level_id INTEGER REFERENCES achievement_levels(id) ON DELETE CASCADE,
  achieved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, achievement_level_id)
);

-- Create product_links table for linking products to playlists
CREATE TABLE IF NOT EXISTS product_links (
  id SERIAL PRIMARY KEY,
  playlist_id INTEGER REFERENCES playlists(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(playlist_id, product_id)
);

-- Create chat_messages table for playlist discussions
CREATE TABLE IF NOT EXISTS chat_messages (
  id SERIAL PRIMARY KEY,
  playlist_id INTEGER REFERENCES playlists(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_deleted BOOLEAN DEFAULT FALSE
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_qr_codes_owner_id ON qr_codes(owner_id);
CREATE INDEX IF NOT EXISTS idx_qr_codes_active ON qr_codes(is_active);
CREATE INDEX IF NOT EXISTS idx_qr_scans_qr_code_id ON qr_scans(qr_code_id);
CREATE INDEX IF NOT EXISTS idx_qr_scans_scanned_at ON qr_scans(scanned_at);
CREATE INDEX IF NOT EXISTS idx_products_user_id ON products(user_id);
CREATE INDEX IF NOT EXISTS idx_slideshows_owner_id ON slideshows(owner_id);
CREATE INDEX IF NOT EXISTS idx_slideshow_images_slideshow_id ON slideshow_images(slideshow_id);
CREATE INDEX IF NOT EXISTS idx_fanmail_owner_id ON fanmail(owner_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_media_user_id ON media(user_id);
CREATE INDEX IF NOT EXISTS idx_playlists_user_id ON playlists(user_id);
CREATE INDEX IF NOT EXISTS idx_playlist_media_playlist_id ON playlist_media(playlist_id);
CREATE INDEX IF NOT EXISTS idx_playlist_media_media_id ON playlist_media(media_id);
CREATE INDEX IF NOT EXISTS idx_activation_codes_code ON activation_codes(code);
CREATE INDEX IF NOT EXISTS idx_activation_codes_playlist_id ON activation_codes(playlist_id);
CREATE INDEX IF NOT EXISTS idx_activation_codes_slideshow_id ON activation_codes(slideshow_id);
CREATE INDEX IF NOT EXISTS idx_activation_codes_created_by ON activation_codes(created_by);
CREATE INDEX IF NOT EXISTS idx_user_activation_codes_user_id ON user_activation_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activation_codes_activation_code_id ON user_activation_codes(activation_code_id);
CREATE INDEX IF NOT EXISTS idx_product_links_playlist_id ON product_links(playlist_id);
CREATE INDEX IF NOT EXISTS idx_product_links_product_id ON product_links(product_id);
CREATE INDEX IF NOT EXISTS idx_product_links_active ON product_links(is_active);

-- Insert default achievement levels
INSERT INTO achievement_levels (level, name, description, scans_required) VALUES
(1, 'First Scan', 'Your first QR code scan', 1),
(2, 'Getting Started', 'Reached 10 scans', 10),
(3, 'Building Momentum', 'Reached 50 scans', 50),
(4, 'Popular Creator', 'Reached 100 scans', 100),
(5, 'Rising Star', 'Reached 500 scans', 500),
(6, 'Viral Content', 'Reached 1000 scans', 1000),
(7, 'QR Master', 'Reached 5000 scans', 5000),
(8, 'Legend', 'Reached 10000 scans', 10000)
ON CONFLICT (level) DO NOTHING;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at (with IF NOT EXISTS check)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_users_updated_at') THEN
    CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_qr_codes_updated_at') THEN
    CREATE TRIGGER update_qr_codes_updated_at BEFORE UPDATE ON qr_codes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_products_updated_at') THEN
    CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_slideshows_updated_at') THEN
    CREATE TRIGGER update_slideshows_updated_at BEFORE UPDATE ON slideshows FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_media_updated_at') THEN
    CREATE TRIGGER update_media_updated_at BEFORE UPDATE ON media FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_playlists_updated_at') THEN
    CREATE TRIGGER update_playlists_updated_at BEFORE UPDATE ON playlists FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Create index for faster playlist chat queries
CREATE INDEX IF NOT EXISTS idx_chat_messages_playlist_created 
ON chat_messages(playlist_id, created_at DESC) 
WHERE is_deleted = FALSE;

-- Create index for user messages
CREATE INDEX IF NOT EXISTS idx_chat_messages_user 
ON chat_messages(user_id, created_at DESC) 
WHERE is_deleted = FALSE;