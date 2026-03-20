-- Coupon begin date: coupon valid only on or after starts_at (NULL = no start restriction)
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS starts_at TIMESTAMP;

COMMENT ON COLUMN coupons.starts_at IS 'Coupon is not valid before this instant (UTC); NULL means no start restriction';
