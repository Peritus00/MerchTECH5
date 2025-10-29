/**
 * Gender Storage Utilities
 * Manages user-provided gender preferences with localStorage
 */

const GENDER_KEY = 'user_gender_preference';
const GENDER_TIMESTAMP_KEY = 'user_gender_timestamp';
const GENDER_PROMPT_SHOWN_KEY = 'gender_prompt_shown';
const EXPIRY_DAYS = 90; // Ask again after 90 days

export interface UserGender {
  gender: string;
}

export interface GenderPreference extends UserGender {
  timestamp: number;
  expiresAt: number;
}

/**
 * Check if we should show the gender prompt
 * Returns true if:
 * - No gender saved yet
 * - Gender expired (>90 days old)
 * - User hasn't been prompted in this session
 */
export function shouldShowGenderPrompt(): boolean {
  if (typeof window === 'undefined') return false;

  // Check if already shown this session
  const shownThisSession = sessionStorage.getItem(GENDER_PROMPT_SHOWN_KEY);
  if (shownThisSession) return false;

  // Check if gender exists and is valid
  const gender = getUserGender();
  if (!gender) return true;

  // Check if expired
  const now = Date.now();
  return now > gender.expiresAt;
}

/**
 * Get saved user gender (if not expired)
 */
export function getUserGender(): GenderPreference | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = localStorage.getItem(GENDER_KEY);
    const timestamp = localStorage.getItem(GENDER_TIMESTAMP_KEY);

    if (!stored || !timestamp) return null;

    const gender: GenderPreference = JSON.parse(stored);
    const now = Date.now();

    // Check if expired
    if (gender.expiresAt && now > gender.expiresAt) {
      clearUserGender();
      return null;
    }

    return gender;
  } catch (error) {
    console.error('Error reading gender from storage:', error);
    return null;
  }
}

/**
 * Save user gender to localStorage
 */
export function saveUserGender(gender: string): void {
  if (typeof window === 'undefined') return;

  try {
    const now = Date.now();
    const expiresAt = now + EXPIRY_DAYS * 24 * 60 * 60 * 1000;

    const preference: GenderPreference = {
      gender,
      timestamp: now,
      expiresAt,
    };

    localStorage.setItem(GENDER_KEY, JSON.stringify(preference));
    localStorage.setItem(GENDER_TIMESTAMP_KEY, now.toString());

    // Mark as shown this session
    sessionStorage.setItem(GENDER_PROMPT_SHOWN_KEY, 'true');

    console.log('⚧ Gender saved:', gender);
  } catch (error) {
    console.error('Error saving gender to storage:', error);
  }
}

/**
 * Clear user gender from storage
 */
export function clearUserGender(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(GENDER_KEY);
    localStorage.removeItem(GENDER_TIMESTAMP_KEY);
    console.log('⚧ Gender cleared');
  } catch (error) {
    console.error('Error clearing gender from storage:', error);
  }
}

/**
 * Mark that gender prompt was shown (for this session)
 */
export function markGenderPromptShown(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(GENDER_PROMPT_SHOWN_KEY, 'true');
}

/**
 * Get gender for analytics tracking
 * Returns user-provided gender if available, null otherwise
 */
export function getGenderForTracking(): UserGender | null {
  const gender = getUserGender();
  if (!gender) return null;

  return {
    gender: gender.gender,
  };
}

/**
 * Check if gender data is valid
 */
export function isValidGender(gender: any): gender is UserGender {
  return (
    gender &&
    typeof gender.gender === 'string' &&
    gender.gender.trim().length > 0
  );
}

