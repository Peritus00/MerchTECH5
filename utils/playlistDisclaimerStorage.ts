const EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

export const playlistDisclaimerStorageKey = (playlistId: string) =>
  `playlist_disclaimer_accepted_${playlistId}`;

/**
 * Check if stored disclaimer acceptance is valid (not expired).
 * Returns true if accepted within the last 24 hours.
 */
export const hasStoredDisclaimerAcceptance = (stored: string | null): boolean => {
  if (!stored) return false;
  
  // Backwards compatibility: old format was just 'true'
  if (stored === 'true') {
    // Treat legacy 'true' as expired to force re-acceptance with timestamp
    return false;
  }

  try {
    const data = JSON.parse(stored);
    if (!data.timestamp) return false;
    
    const now = Date.now();
    const age = now - data.timestamp;
    
    return age < EXPIRY_MS;
  } catch {
    // Invalid format
    return false;
  }
};

/**
 * Create the storage value for a new disclaimer acceptance.
 */
export const createDisclaimerAcceptance = (): string => {
  return JSON.stringify({
    accepted: true,
    timestamp: Date.now(),
  });
};
