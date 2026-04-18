-- Run in Neon / psql / Railway DB console after migrations.
-- Expects one row per check: status = OK or MISSING.

WITH expected AS (
  SELECT * FROM (VALUES
    ('public', 'activation_codes', 'deleted_at'),
    ('public', 'coupon_item_map', 'coupon_id'),
    ('public', 'coupon_item_map', 'product_id'),
    ('public', 'coupon_item_map', 'playlist_id'),
    ('public', 'coupon_item_map', 'slideshow_id'),
    ('public', 'coupons', 'id'),
    ('public', 'coupons', 'owner_id'),
    ('public', 'coupons', 'discount_type'),
    ('public', 'coupons', 'discount_value'),
    ('public', 'coupons', 'starts_at'),
    ('public', 'playlists', 'preview_coupon_id'),
    ('public', 'playlists', 'require_phone_for_preview'),
    ('public', 'slideshows', 'preview_coupon_id'),
    ('public', 'slideshows', 'require_phone_for_preview'),
    ('public', 'coupon_redemptions', 'coupon_id'),
    ('public', 'marketing_sms_consents', 'phone_e164')
  ) AS t(table_schema, table_name, column_name)
),
tables_expected AS (
  SELECT * FROM (VALUES
    ('public', 'activation_codes'),
    ('public', 'coupon_item_map'),
    ('public', 'coupons'),
    ('public', 'coupon_redemptions'),
    ('public', 'marketing_sms_consents'),
    ('public', 'marketing_sms_events'),
    ('public', 'user_feature_settings'),
    ('public', 'system_feature_settings'),
    ('public', 'preview_phone_leads'),
    ('public', 'preview_phone_lead_events')
  ) AS t(table_schema, table_name)
)
SELECT
  'table' AS kind,
  te.table_schema,
  te.table_name,
  NULL::text AS column_name,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables ist
      WHERE ist.table_schema = te.table_schema AND ist.table_name = te.table_name
    ) THEN 'OK'
    ELSE 'MISSING TABLE'
  END AS status
FROM tables_expected te
UNION ALL
SELECT
  'column' AS kind,
  e.table_schema,
  e.table_name,
  e.column_name,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = e.table_schema
        AND c.table_name = e.table_name
        AND c.column_name = e.column_name
    ) THEN 'OK'
    ELSE 'MISSING COLUMN'
  END AS status
FROM expected e
ORDER BY kind, table_name, column_name NULLS LAST;
