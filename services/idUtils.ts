/**
 * ID Utilities for Content Type Management
 * 
 * This module provides utilities for managing and detecting content types
 * based on IDs to prevent conflicts between playlists and slideshows.
 */

export type ContentType = 'playlist' | 'slideshow';

/**
 * Determines content type based on ID ranges
 * - Playlists: 1 - 999,999
 * - Slideshows: 1,000,000+
 */
export function getContentTypeById(id: number): ContentType {
  return id >= 1000000 ? 'slideshow' : 'playlist';
}

/**
 * Validates if an ID is in the correct range for its content type
 */
export function validateContentId(id: number, expectedType: ContentType): boolean {
  const actualType = getContentTypeById(id);
  return actualType === expectedType;
}

/**
 * Generates a prefixed ID string for URLs to make content type explicit
 */
export function generateContentUrl(id: number, type: ContentType): string {
  const prefix = type === 'playlist' ? 'pl' : 'sl';
  return `${prefix}_${id}`;
}

/**
 * Parses a prefixed content URL to extract ID and type
 */
export function parseContentUrl(urlId: string): { id: number; type: ContentType } | null {
  const match = urlId.match(/^(pl|sl)_(\d+)$/);
  if (!match) {
    // Fallback to numeric ID - try to determine type by range
    const numericId = parseInt(urlId);
    if (isNaN(numericId)) return null;
    
    return {
      id: numericId,
      type: getContentTypeById(numericId)
    };
  }
  
  const [, prefix, idStr] = match;
  const id = parseInt(idStr);
  const type = prefix === 'pl' ? 'playlist' : 'slideshow';
  
  return { id, type };
}

/**
 * Migration helper: Suggests new ID for content that's in wrong range
 */
export function suggestIdMigration(currentId: number, contentType: ContentType): number | null {
  const currentType = getContentTypeById(currentId);
  
  if (currentType === contentType) {
    return null; // No migration needed
  }
  
  if (contentType === 'slideshow' && currentId < 1000000) {
    return currentId + 1000000;
  }
  
  if (contentType === 'playlist' && currentId >= 1000000) {
    // This is more complex - would need to find available slot in playlist range
    console.warn('Playlist ID migration not implemented - contact support');
    return null;
  }
  
  return null;
}

/**
 * Debug helper: Log content type information
 */
export function logContentInfo(id: number, expectedType?: ContentType): void {
  const detectedType = getContentTypeById(id);
  const isValid = expectedType ? validateContentId(id, expectedType) : true;
  
  console.log(`📋 Content ID ${id}:`, {
    detectedType,
    expectedType,
    isValid,
    range: detectedType === 'playlist' ? '1-999,999' : '1,000,000+'
  });
} 