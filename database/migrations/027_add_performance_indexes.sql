-- Phase 2: Database Scalability - Performance Indexes
-- This migration adds indexes for common query patterns identified in the codebase
-- Run this migration to optimize database performance

-- ============================================
-- QR Codes and Scans Indexes
-- ============================================

-- Composite index for QR codes by user and active status (common query pattern)
CREATE INDEX IF NOT EXISTS idx_qr_codes_user_active ON qr_codes(user_id, is_active) WHERE is_active = true;

-- Index for QR scans by QR code and scan time (for analytics queries)
CREATE INDEX IF NOT EXISTS idx_qr_scans_qr_code_scanned_at ON qr_scans(qr_code_id, scanned_at DESC);

-- Index for QR scans by visitor ID (for anonymous user tracking)
CREATE INDEX IF NOT EXISTS idx_qr_scans_visitor_id ON qr_scans(qr_visitor_id) WHERE qr_visitor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_qr_scans_visitor_id_alt ON qr_scans(visitor_id) WHERE visitor_id IS NOT NULL;

-- Composite index for QR scans location queries (country, city, region)
CREATE INDEX IF NOT EXISTS idx_qr_scans_location ON qr_scans(country_code, city, region) WHERE country_code IS NOT NULL;

-- Index for QR scans date range queries
CREATE INDEX IF NOT EXISTS idx_qr_scans_date_range ON qr_scans(scanned_at) WHERE scanned_at >= NOW() - INTERVAL '90 days';

-- ============================================
-- Media and Playlists Indexes
-- ============================================

-- Composite index for media by user and creation time
CREATE INDEX IF NOT EXISTS idx_media_user_created ON media(user_id, created_at DESC);

-- Index for media by file type (for filtering)
CREATE INDEX IF NOT EXISTS idx_media_file_type ON media(file_type);

-- Composite index for playlists by user and public status
CREATE INDEX IF NOT EXISTS idx_playlists_user_public ON playlists(user_id, is_public);

-- Index for playlist media ordering
CREATE INDEX IF NOT EXISTS idx_playlist_media_order ON playlist_media(playlist_id, display_order);

-- ============================================
-- Analytics and Tracking Indexes
-- ============================================

-- Index for media plays by user and play time
CREATE INDEX IF NOT EXISTS idx_media_plays_user_played ON media_plays(user_id, played_at DESC) WHERE user_id IS NOT NULL;

-- Index for media plays by session (for unique play tracking)
CREATE INDEX IF NOT EXISTS idx_media_plays_session ON media_plays(media_id, session_id);

-- Composite index for media plays date range queries
CREATE INDEX IF NOT EXISTS idx_media_plays_date_range ON media_plays(played_at) WHERE played_at >= NOW() - INTERVAL '90 days';

-- Index for playlist plays
CREATE INDEX IF NOT EXISTS idx_playlist_plays_playlist_played ON playlist_plays(playlist_id, played_at DESC);
CREATE INDEX IF NOT EXISTS idx_playlist_plays_session ON playlist_plays(playlist_id, session_id);

-- Index for slideshow plays
CREATE INDEX IF NOT EXISTS idx_slideshow_plays_slideshow_played ON slideshow_plays(slideshow_id, played_at DESC);
CREATE INDEX IF NOT EXISTS idx_slideshow_plays_session ON slideshow_plays(slideshow_id, session_id);

-- Index for cart events
CREATE INDEX IF NOT EXISTS idx_cart_events_user_added ON cart_events(user_id, added_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cart_events_product ON cart_events(product_id);

-- ============================================
-- Products Indexes
-- ============================================

-- Composite index for products by user and active status
CREATE INDEX IF NOT EXISTS idx_products_user_active ON products(user_id, is_active) WHERE is_active = true;

-- Index for products by creation time
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at DESC);

-- ============================================
-- Slideshows Indexes
-- ============================================

-- Composite index for slideshows by owner and active status
CREATE INDEX IF NOT EXISTS idx_slideshows_owner_active ON slideshows(user_id, deleted_at) WHERE deleted_at IS NULL;

-- Index for slideshow images ordering
CREATE INDEX IF NOT EXISTS idx_slideshow_images_order ON slideshow_images(slideshow_id, order_index);

-- ============================================
-- Activation Codes Indexes
-- ============================================

-- Composite index for activation codes lookup (code, slideshow_id, expires_at)
CREATE INDEX IF NOT EXISTS idx_activation_codes_lookup ON activation_codes(code, slideshow_id, expires_at) WHERE expires_at > NOW() OR expires_at IS NULL;

-- Index for activation codes by slideshow
CREATE INDEX IF NOT EXISTS idx_activation_codes_slideshow ON activation_codes(slideshow_id);

-- ============================================
-- Users Indexes
-- ============================================

-- Index for users by admin status (for admin queries)
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin) WHERE is_admin = true;

-- Index for users by email verification status
CREATE INDEX IF NOT EXISTS idx_users_email_verified ON users(is_email_verified) WHERE is_email_verified = true;

-- Index for users by subscription tier
CREATE INDEX IF NOT EXISTS idx_users_subscription_tier ON users(subscription_tier);

-- ============================================
-- Activity Logs Indexes
-- ============================================

-- Composite index for activity logs by user and action type
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_action ON activity_logs(user_id, action_type, created_at DESC);

-- Index for activity logs by resource type and ID
CREATE INDEX IF NOT EXISTS idx_activity_logs_resource ON activity_logs(resource_type, resource_id);

-- Index for activity logs date range queries
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);

-- ============================================
-- Orders and Order Items Indexes
-- ============================================

-- Index for orders by user and purchase date
CREATE INDEX IF NOT EXISTS idx_orders_user_purchased ON orders(user_id, purchased_at DESC) WHERE user_id IS NOT NULL;

-- Index for orders by Stripe session ID (for webhook lookups)
CREATE INDEX IF NOT EXISTS idx_orders_stripe_session ON orders(stripe_session_id);

-- ============================================
-- Product Links Indexes
-- ============================================

-- Composite index for product links by playlist and active status
CREATE INDEX IF NOT EXISTS idx_product_links_playlist_active ON product_links(playlist_id, is_active) WHERE is_active = true;

-- Index for product links ordering
CREATE INDEX IF NOT EXISTS idx_product_links_order ON product_links(playlist_id, display_order);

-- ============================================
-- Pending Users Indexes
-- ============================================

-- Index for pending users by verification token (for email verification)
CREATE INDEX IF NOT EXISTS idx_pending_users_token ON pending_users(verification_token);

-- Index for pending users expiration cleanup
CREATE INDEX IF NOT EXISTS idx_pending_users_expires_at ON pending_users(expires_at) WHERE expires_at < NOW();

-- ============================================
-- App Versions Indexes
-- ============================================

-- Composite index for app versions by platform and active status
CREATE INDEX IF NOT EXISTS idx_app_versions_platform_active ON app_versions(platform, is_active) WHERE is_active = true;

-- Index for app versions by creation time (for latest version queries)
CREATE INDEX IF NOT EXISTS idx_app_versions_created_at ON app_versions(created_at DESC);

-- ============================================
-- Notes on Index Usage
-- ============================================
-- These indexes are designed to optimize:
-- 1. Common WHERE clause filters (user_id, is_active, deleted_at IS NULL)
-- 2. JOIN operations (foreign key columns)
-- 3. ORDER BY clauses (created_at DESC, scanned_at DESC)
-- 4. Date range queries (scanned_at >= NOW() - INTERVAL 'X days')
-- 5. Composite queries combining multiple filters
--
-- Partial indexes (WHERE clauses) are used to:
-- - Reduce index size for filtered data
-- - Improve query performance for common patterns
-- - Optimize for active/non-deleted records
--
-- Monitor index usage with:
-- SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
-- FROM pg_stat_user_indexes
-- ORDER BY idx_scan DESC;

