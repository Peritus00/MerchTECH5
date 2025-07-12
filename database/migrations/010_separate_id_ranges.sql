-- Migration to separate ID ranges for playlists and slideshows
-- This prevents ID conflicts between the two content types

-- Set slideshow sequence to start at 1,000,000
-- This ensures slideshow IDs will be 1,000,000+ while playlist IDs remain 1-999,999
DO $$
BEGIN
  -- Check if slideshows sequence exists and set it to start at 1,000,000
  IF EXISTS (SELECT 1 FROM information_schema.sequences WHERE sequence_name = 'slideshows_id_seq') THEN
    -- Get the current maximum slideshow ID
    DECLARE
      current_max INTEGER;
    BEGIN
      SELECT COALESCE(MAX(id), 0) INTO current_max FROM slideshows;
      
      -- Set the sequence to start at 1,000,000 or current max + 1,000,000, whichever is higher
      IF current_max < 1000000 THEN
        PERFORM setval('slideshows_id_seq', 1000000, false);
        RAISE NOTICE 'Slideshow ID sequence set to start at 1,000,000';
      ELSE
        PERFORM setval('slideshows_id_seq', current_max + 1000000, false);
        RAISE NOTICE 'Slideshow ID sequence set to start at %', current_max + 1000000;
      END IF;
    END;
  END IF;
  
  -- Ensure playlist sequence stays in the 1-999,999 range
  IF EXISTS (SELECT 1 FROM information_schema.sequences WHERE sequence_name = 'playlists_id_seq') THEN
    DECLARE
      current_max INTEGER;
    BEGIN
      SELECT COALESCE(MAX(id), 0) INTO current_max FROM playlists;
      
      -- If playlist IDs are approaching 1,000,000, we need to handle this
      IF current_max >= 999999 THEN
        RAISE EXCEPTION 'Playlist IDs are approaching the reserved slideshow range. Please contact support.';
      END IF;
      
      RAISE NOTICE 'Playlist ID sequence is properly configured (current max: %)', current_max;
    END;
  END IF;
END $$;

-- Add a constraint to ensure playlists never exceed 999,999
ALTER TABLE playlists 
ADD CONSTRAINT check_playlist_id_range 
CHECK (id < 1000000);

-- Add a constraint to ensure slideshows are always >= 1,000,000
ALTER TABLE slideshows 
ADD CONSTRAINT check_slideshow_id_range 
CHECK (id >= 1000000);

-- Create a function to validate content type by ID
CREATE OR REPLACE FUNCTION get_content_type_by_id(content_id INTEGER)
RETURNS TEXT AS $$
BEGIN
  IF content_id < 1000000 THEN
    RETURN 'playlist';
  ELSE
    RETURN 'slideshow';
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Add comments to document the ID ranges
COMMENT ON TABLE playlists IS 'Playlist table - IDs range from 1 to 999,999';
COMMENT ON TABLE slideshows IS 'Slideshow table - IDs range from 1,000,000 and above';
COMMENT ON FUNCTION get_content_type_by_id(INTEGER) IS 'Determines content type based on ID range: <1M = playlist, >=1M = slideshow'; 