/**
 * Location Storage Utilities
 * Manages user-provided location preferences with localStorage
 */

const LOCATION_KEY = 'user_location_preference';
const LOCATION_TIMESTAMP_KEY = 'user_location_timestamp';
const LOCATION_PROMPT_SHOWN_KEY = 'location_prompt_shown';
const EXPIRY_DAYS = 90; // Ask again after 90 days

export interface UserLocation {
  city: string;
  state: string;
  zip?: string;
}

export interface LocationPreference extends UserLocation {
  timestamp: number;
  expiresAt: number;
}

/**
 * Check if we should show the location prompt
 * Returns true if:
 * - No location saved yet
 * - Location expired (>90 days old)
 * - User hasn't been prompted in this session
 */
export function shouldShowLocationPrompt(): boolean {
  if (typeof window === 'undefined') return false;

  // Check if already shown this session
  const shownThisSession = sessionStorage.getItem(LOCATION_PROMPT_SHOWN_KEY);
  if (shownThisSession) return false;

  // Check if location exists and is valid
  const location = getUserLocation();
  if (!location) return true;

  // Check if expired
  const now = Date.now();
  return now > location.expiresAt;
}

/**
 * Get saved user location (if not expired)
 */
export function getUserLocation(): LocationPreference | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = localStorage.getItem(LOCATION_KEY);
    const timestamp = localStorage.getItem(LOCATION_TIMESTAMP_KEY);

    if (!stored || !timestamp) return null;

    const location: LocationPreference = JSON.parse(stored);
    const now = Date.now();

    // Check if expired
    if (location.expiresAt && now > location.expiresAt) {
      clearUserLocation();
      return null;
    }

    return location;
  } catch (error) {
    console.error('Error reading location from storage:', error);
    return null;
  }
}

/**
 * Save user location to localStorage
 */
export function saveUserLocation(location: UserLocation): void {
  if (typeof window === 'undefined') return;

  try {
    const now = Date.now();
    const expiresAt = now + EXPIRY_DAYS * 24 * 60 * 60 * 1000;

    const preference: LocationPreference = {
      ...location,
      timestamp: now,
      expiresAt,
    };

    localStorage.setItem(LOCATION_KEY, JSON.stringify(preference));
    localStorage.setItem(LOCATION_TIMESTAMP_KEY, now.toString());

    // Mark as shown this session
    sessionStorage.setItem(LOCATION_PROMPT_SHOWN_KEY, 'true');

    console.log('📍 Location saved:', location.city, location.state);
  } catch (error) {
    console.error('Error saving location to storage:', error);
  }
}

/**
 * Clear user location from storage
 */
export function clearUserLocation(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(LOCATION_KEY);
    localStorage.removeItem(LOCATION_TIMESTAMP_KEY);
    console.log('📍 Location cleared');
  } catch (error) {
    console.error('Error clearing location from storage:', error);
  }
}

/**
 * Mark that location prompt was shown (for this session)
 */
export function markLocationPromptShown(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(LOCATION_PROMPT_SHOWN_KEY, 'true');
}

/**
 * Get location for analytics tracking
 * Returns user-provided location if available, null otherwise
 */
export function getLocationForTracking(): UserLocation | null {
  const location = getUserLocation();
  if (!location) return null;

  return {
    city: location.city,
    state: location.state,
    zip: location.zip,
  };
}

/**
 * Format location as display string
 */
export function formatLocation(location: UserLocation | LocationPreference): string {
  if (!location) return 'Unknown';
  
  if (location.zip) {
    return `${location.city}, ${location.state} ${location.zip}`;
  }
  
  return `${location.city}, ${location.state}`;
}

/**
 * Check if location data is valid
 */
export function isValidLocation(location: any): location is UserLocation {
  return (
    location &&
    typeof location.city === 'string' &&
    location.city.trim().length > 0 &&
    typeof location.state === 'string' &&
    location.state.trim().length === 2
  );
}

