-- Explicit preview coupon selection for playlists and slideshows
ALTER TABLE playlists
  ADD COLUMN IF NOT EXISTS preview_coupon_id INTEGER REFERENCES coupons(id) ON DELETE SET NULL;

ALTER TABLE slideshows
  ADD COLUMN IF NOT EXISTS preview_coupon_id INTEGER REFERENCES coupons(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_playlists_preview_coupon_id ON playlists(preview_coupon_id);
CREATE INDEX IF NOT EXISTS idx_slideshows_preview_coupon_id ON slideshows(preview_coupon_id);
