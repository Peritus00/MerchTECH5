// Visitor ID utility for tracking QR scans
// Provides fallback when cookies don't work in cross-origin scenarios

const VISITOR_ID_KEY = 'qr_visitor_id';

/**
 * Get or create a visitor ID, storing it in localStorage
 * This provides a fallback when cookies don't work (e.g., cross-origin issues)
 */
export function getOrCreateVisitorId(): string {
  if (typeof window === 'undefined') {
    // Server-side: generate a temporary ID (shouldn't happen in practice)
    return generateVisitorId();
  }

  try {
    // Try to get existing visitor ID from localStorage
    const existing = localStorage.getItem(VISITOR_ID_KEY);
    if (existing) {
      return existing;
    }

    // Generate new visitor ID
    const newId = generateVisitorId();
    localStorage.setItem(VISITOR_ID_KEY, newId);
    console.log('🍪 VISITOR_ID: Created new visitor ID:', newId.substring(0, 8) + '...');
    return newId;
  } catch (error) {
    // localStorage might not be available (e.g., private browsing)
    console.warn('🍪 VISITOR_ID: localStorage not available, generating temporary ID');
    return generateVisitorId();
  }
}

/**
 * Generate a UUID v4 visitor ID
 */
function generateVisitorId(): string {
  // Generate UUID v4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Get the current visitor ID without creating a new one
 */
export function getVisitorId(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return localStorage.getItem(VISITOR_ID_KEY);
  } catch (error) {
    return null;
  }
}

