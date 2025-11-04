-- Backfill demographic and geographic data for media_plays, playlist_plays, and slideshow_plays
-- from existing QR scans data

-- Strategy 1: Link by session_id matching qr_visitor_id or visitor_id
-- This matches the same session where a QR scan occurred and media was played

-- Backfill media_plays from QR scans by session_id
UPDATE media_plays mp
SET 
  user_provided_age_range = qs.user_provided_age_range,
  user_provided_gender = qs.user_provided_gender,
  user_provided_city = COALESCE(qs.user_provided_city, qs.city),
  user_provided_state = COALESCE(qs.user_provided_state, qs.region),
  user_provided_zip = qs.user_provided_zip,
  location_source = COALESCE(qs.location_source, 
    CASE 
      WHEN qs.user_provided_city IS NOT NULL THEN 'user'
      WHEN qs.city IS NOT NULL OR qs.region IS NOT NULL THEN 'auto'
      ELSE 'unknown'
    END
  )
FROM qr_scans qs
WHERE mp.session_id = COALESCE(qs.qr_visitor_id, qs.visitor_id::text)
  AND mp.user_provided_age_range IS NULL
  AND mp.user_provided_city IS NULL
  AND qs.user_provided_age_range IS NOT NULL OR qs.user_provided_city IS NOT NULL OR qs.city IS NOT NULL;

-- Backfill playlist_plays from QR scans by session_id
UPDATE playlist_plays pp
SET 
  user_provided_age_range = qs.user_provided_age_range,
  user_provided_gender = qs.user_provided_gender,
  user_provided_city = COALESCE(qs.user_provided_city, qs.city),
  user_provided_state = COALESCE(qs.user_provided_state, qs.region),
  user_provided_zip = qs.user_provided_zip,
  location_source = COALESCE(qs.location_source,
    CASE 
      WHEN qs.user_provided_city IS NOT NULL THEN 'user'
      WHEN qs.city IS NOT NULL OR qs.region IS NOT NULL THEN 'auto'
      ELSE 'unknown'
    END
  )
FROM qr_scans qs
WHERE pp.session_id = COALESCE(qs.qr_visitor_id, qs.visitor_id::text)
  AND pp.user_provided_age_range IS NULL
  AND pp.user_provided_city IS NULL
  AND (qs.user_provided_age_range IS NOT NULL OR qs.user_provided_city IS NOT NULL OR qs.city IS NOT NULL);

-- Backfill slideshow_plays from QR scans by session_id
UPDATE slideshow_plays sp
SET 
  user_provided_age_range = qs.user_provided_age_range,
  user_provided_gender = qs.user_provided_gender,
  user_provided_city = COALESCE(qs.user_provided_city, qs.city),
  user_provided_state = COALESCE(qs.user_provided_state, qs.region),
  user_provided_zip = qs.user_provided_zip,
  location_source = COALESCE(qs.location_source,
    CASE 
      WHEN qs.user_provided_city IS NOT NULL THEN 'user'
      WHEN qs.city IS NOT NULL OR qs.region IS NOT NULL THEN 'auto'
      ELSE 'unknown'
    END
  )
FROM qr_scans qs
WHERE sp.session_id = COALESCE(qs.qr_visitor_id, qs.visitor_id::text)
  AND sp.user_provided_age_range IS NULL
  AND sp.user_provided_city IS NULL
  AND (qs.user_provided_age_range IS NOT NULL OR qs.user_provided_city IS NOT NULL OR qs.city IS NOT NULL);

-- Strategy 2: Link by user_id from users table (for authenticated users with profile demographics)
-- This fills in age/gender from user profiles, and location from their recent QR scans

-- Update media_plays with user profile demographics
UPDATE media_plays mp
SET 
  user_provided_age_range = COALESCE(mp.user_provided_age_range, u.age_range),
  user_provided_gender = COALESCE(mp.user_provided_gender, u.gender)
FROM users u
WHERE mp.user_id = u.id
  AND (mp.user_provided_age_range IS NULL OR mp.user_provided_gender IS NULL)
  AND (u.age_range IS NOT NULL OR u.gender IS NOT NULL);

-- Update playlist_plays with user profile demographics
UPDATE playlist_plays pp
SET 
  user_provided_age_range = COALESCE(pp.user_provided_age_range, u.age_range),
  user_provided_gender = COALESCE(pp.user_provided_gender, u.gender)
FROM users u
WHERE pp.user_id = u.id
  AND (pp.user_provided_age_range IS NULL OR pp.user_provided_gender IS NULL)
  AND (u.age_range IS NOT NULL OR u.gender IS NOT NULL);

-- Update slideshow_plays with user profile demographics
UPDATE slideshow_plays sp
SET 
  user_provided_age_range = COALESCE(sp.user_provided_age_range, u.age_range),
  user_provided_gender = COALESCE(sp.user_provided_gender, u.gender)
FROM users u
WHERE sp.user_id = u.id
  AND (sp.user_provided_age_range IS NULL OR sp.user_provided_gender IS NULL)
  AND (u.age_range IS NOT NULL OR u.gender IS NOT NULL);

-- Strategy 3: Link by user_id - get location from most recent QR scan for authenticated users
-- This helps fill in location data for plays where we have a user_id but no matching session_id

WITH user_locations AS (
  SELECT DISTINCT ON (qs.qr_code_id, COALESCE(qs.qr_visitor_id, qs.visitor_id::text))
    COALESCE(qs.qr_visitor_id, qs.visitor_id::text) as session_key,
    COALESCE(qs.user_provided_city, qs.city) as city,
    COALESCE(qs.user_provided_state, qs.region) as state,
    qs.user_provided_zip,
    COALESCE(qs.location_source,
      CASE 
        WHEN qs.user_provided_city IS NOT NULL THEN 'user'
        WHEN qs.city IS NOT NULL OR qs.region IS NOT NULL THEN 'auto'
        ELSE 'unknown'
      END
    ) as loc_source
  FROM qr_scans qs
  WHERE qs.user_provided_city IS NOT NULL 
     OR qs.city IS NOT NULL
  ORDER BY qs.qr_code_id, COALESCE(qs.qr_visitor_id, qs.visitor_id::text), qs.scanned_at DESC
)
UPDATE media_plays mp
SET 
  user_provided_city = COALESCE(mp.user_provided_city, ul.city),
  user_provided_state = COALESCE(mp.user_provided_state, ul.state),
  user_provided_zip = COALESCE(mp.user_provided_zip, ul.user_provided_zip),
  location_source = COALESCE(mp.location_source, ul.loc_source)
FROM user_locations ul
WHERE mp.session_id = ul.session_key
  AND mp.user_provided_city IS NULL
  AND ul.city IS NOT NULL;

-- Strategy 3: Fill location from IP address for plays that still have no location
-- This uses geoip-lite logic but requires running a separate script
-- For now, we'll mark these as needing IP-based lookup

-- Note: IP-based geo lookup should be done via a Node.js script using geoip-lite
-- as it's more efficient than doing it in SQL

-- Summary query to check backfill results
-- Run this after the migration to see how many records were updated:
-- SELECT 
--   'media_plays' as table_name,
--   COUNT(*) FILTER (WHERE user_provided_age_range IS NOT NULL) as with_age,
--   COUNT(*) FILTER (WHERE user_provided_gender IS NOT NULL) as with_gender,
--   COUNT(*) FILTER (WHERE user_provided_city IS NOT NULL) as with_location,
--   COUNT(*) as total
-- FROM media_plays
-- UNION ALL
-- SELECT 
--   'playlist_plays' as table_name,
--   COUNT(*) FILTER (WHERE user_provided_age_range IS NOT NULL) as with_age,
--   COUNT(*) FILTER (WHERE user_provided_gender IS NOT NULL) as with_gender,
--   COUNT(*) FILTER (WHERE user_provided_city IS NOT NULL) as with_location,
--   COUNT(*) as total
-- FROM playlist_plays
-- UNION ALL
-- SELECT 
--   'slideshow_plays' as table_name,
--   COUNT(*) FILTER (WHERE user_provided_age_range IS NOT NULL) as with_age,
--   COUNT(*) FILTER (WHERE user_provided_gender IS NOT NULL) as with_gender,
--   COUNT(*) FILTER (WHERE user_provided_city IS NOT NULL) as with_location,
--   COUNT(*) as total
-- FROM slideshow_plays;

