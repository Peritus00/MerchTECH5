# ID Management System Guide

## Overview

This guide explains how to prevent ID conflicts between playlists and slideshows in the MerchTech application.

## Problem

Previously, both playlists and slideshows used the same PostgreSQL SERIAL sequence, causing overlapping IDs. This led to:
- Media player confusion when trying to determine content type
- Activation codes potentially working for wrong content type
- General system ambiguity

## Solution

We've implemented a **range-based ID separation system**:

### ID Ranges

| Content Type | ID Range | Description |
|-------------|----------|-------------|
| **Playlists** | 1 - 999,999 | Standard auto-increment starting from 1 |
| **Slideshows** | 1,000,000+ | Offset sequence starting from 1,000,000 |

### Benefits

1. **Instant Type Detection**: Any ID >= 1,000,000 is automatically a slideshow
2. **No Conflicts**: Impossible for playlist and slideshow to share same ID
3. **Backward Compatible**: Existing content continues to work
4. **Scalable**: 999,999 playlists and unlimited slideshows supported

## Implementation

### 1. Database Migration

Run the migration script to separate existing IDs:

```bash
node scripts/migrate-id-ranges.js
```

This script:
- Moves conflicting slideshows to 1,000,000+ range
- Updates all related foreign keys
- Sets sequence starting points
- Adds constraints to prevent future conflicts

### 2. Utility Functions

Use the `services/idUtils.ts` module for ID management:

```typescript
import { getContentTypeById, validateContentId, logContentInfo } from '@/services/idUtils';

// Determine content type by ID
const contentType = getContentTypeById(22); // 'playlist'
const contentType2 = getContentTypeById(1000022); // 'slideshow'

// Validate ID is in correct range
const isValid = validateContentId(22, 'playlist'); // true
const isValid2 = validateContentId(22, 'slideshow'); // false

// Debug logging
logContentInfo(22, 'playlist'); // Logs detailed info
```

### 3. Media Player Updates

The media player now uses intelligent content detection:

1. **URL Context Detection**: Checks referrer URL to determine likely content type
2. **Smart API Calls**: Tries most likely API first based on context
3. **Content Validation**: Verifies content has actual media files
4. **Fallback Logic**: Falls back to other content type if first attempt fails

### 4. Database Constraints

The migration adds constraints to prevent future conflicts:

```sql
-- Ensure playlists stay in correct range
ALTER TABLE playlists 
ADD CONSTRAINT check_playlist_id_range 
CHECK (id < 1000000);

-- Ensure slideshows stay in correct range  
ALTER TABLE slideshows 
ADD CONSTRAINT check_slideshow_id_range 
CHECK (id >= 1000000);
```

## Usage Examples

### Creating New Content

When creating new content, the sequences automatically assign correct IDs:

```javascript
// New playlist - will get ID like 23, 24, 25...
const playlist = await pool.query(
  'INSERT INTO playlists (name, user_id) VALUES ($1, $2) RETURNING *',
  ['My Playlist', userId]
);

// New slideshow - will get ID like 1000001, 1000002, 1000003...
const slideshow = await pool.query(
  'INSERT INTO slideshows (name, user_id) VALUES ($1, $2) RETURNING *',
  ['My Slideshow', userId]
);
```

### Content Type Detection

```javascript
// In your application code
function getContentType(id) {
  return id >= 1000000 ? 'slideshow' : 'playlist';
}

// Usage
const contentId = 1000022;
const type = getContentType(contentId); // 'slideshow'
```

### API Routing

```javascript
// Smart API routing based on ID
async function fetchContent(id) {
  const contentType = getContentType(id);
  
  if (contentType === 'playlist') {
    return await playlistAPI.getById(id);
  } else {
    return await slideshowAPI.getById(id);
  }
}
```

## Migration Process

### Before Migration

```
Playlists: ID 1, 2, 3, 22, 23...
Slideshows: ID 1, 2, 3, 22, 23... ❌ CONFLICT!
```

### After Migration

```
Playlists: ID 1, 2, 3, 22, 23... (unchanged)
Slideshows: ID 1000001, 1000002, 1000003, 1000022, 1000023... ✅ NO CONFLICTS!
```

## Troubleshooting

### Common Issues

1. **"Content not found" errors**: Check if you're using the correct ID after migration
2. **Wrong content type detected**: Verify the ID is in the correct range
3. **Database constraints failing**: Ensure sequences are set correctly

### Debug Tools

```javascript
// Check current sequence values
SELECT last_value FROM playlists_id_seq;   -- Should be < 1000000
SELECT last_value FROM slideshows_id_seq;  -- Should be >= 1000000

// Find content by ID
SELECT get_content_type_by_id(22);      -- 'playlist'
SELECT get_content_type_by_id(1000022); -- 'slideshow'

// Check for conflicts
SELECT id FROM playlists WHERE id >= 1000000;  -- Should be empty
SELECT id FROM slideshows WHERE id < 1000000;  -- Should be empty
```

## Future Considerations

### Scaling

- **Playlists**: 999,999 maximum (should be sufficient for most use cases)
- **Slideshows**: Unlimited (can grow to PostgreSQL integer limit)
- **If playlist limit approached**: Implement playlist archiving or contact support

### Alternative Approaches

If range-based separation becomes insufficient:

1. **UUID System**: Switch to UUIDs for globally unique identifiers
2. **Prefixed IDs**: Use string IDs like "pl_123" and "sl_456"
3. **Composite Keys**: Use (type, id) as compound primary key

## Testing

### Verify Migration Success

```bash
# Run the verification script
node scripts/verify-id-ranges.js

# Check database state
psql $DATABASE_URL -c "
SELECT 
  'playlists' as table_name,
  MIN(id) as min_id,
  MAX(id) as max_id,
  COUNT(*) as count
FROM playlists
UNION ALL
SELECT 
  'slideshows' as table_name,
  MIN(id) as min_id,
  MAX(id) as max_id,
  COUNT(*) as count
FROM slideshows;
"
```

### Test Content Detection

```javascript
// Test the media player with various IDs
const testIds = [22, 1000022, 23, 1000023];

for (const id of testIds) {
  console.log(`ID ${id}: ${getContentTypeById(id)}`);
}
```

## Summary

The ID range separation system provides:

✅ **Conflict Prevention**: No more overlapping IDs  
✅ **Type Detection**: Instant content type identification  
✅ **Backward Compatibility**: Existing content continues working  
✅ **Future-Proof**: Constraints prevent regression  
✅ **Developer-Friendly**: Clear utilities and documentation  

This system ensures reliable content type detection and prevents the confusion that led to the "playlist test3" being detected as a slideshow. 