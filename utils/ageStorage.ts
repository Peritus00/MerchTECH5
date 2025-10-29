/**
 * Age Storage Utilities
 * Manages user-provided age preferences with localStorage
 */

const AGE_KEY = 'user_age_preference';
const AGE_TIMESTAMP_KEY = 'user_age_timestamp';
const AGE_PROMPT_SHOWN_KEY = 'age_prompt_shown';
const EXPIRY_DAYS = 90; // Ask again after 90 days

export interface UserAge {
  ageRange: string;
}

export interface AgePreference extends UserAge {
  timestamp: number;
  expiresAt: number;
}

/**
 * Check if we should show the age prompt
 * Returns true if:
 * - No age saved yet
 * - Age expired (>90 days old)
 * - User hasn't been prompted in this session
 */
export function shouldShowAgePrompt(): boolean {
  if (typeof window === 'undefined') return false;

  // Check if already shown this session
  const shownThisSession = sessionStorage.getItem(AGE_PROMPT_SHOWN_KEY);
  if (shownThisSession) return false;

  // Check if age exists and is valid
  const age = getUserAge();
  if (!age) return true;

  // Check if expired
  const now = Date.now();
  return now > age.expiresAt;
}

/**
 * Get saved user age (if not expired)
 */
export function getUserAge(): AgePreference | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = localStorage.getItem(AGE_KEY);
    const timestamp = localStorage.getItem(AGE_TIMESTAMP_KEY);

    if (!stored || !timestamp) return null;

    const age: AgePreference = JSON.parse(stored);
    const now = Date.now();

    // Check if expired
    if (age.expiresAt && now > age.expiresAt) {
      clearUserAge();
      return null;
    }

    return age;
  } catch (error) {
    console.error('Error reading age from storage:', error);
    return null;
  }
}

/**
 * Save user age to localStorage
 */
export function saveUserAge(ageRange: string): void {
  if (typeof window === 'undefined') return;

  try {
    const now = Date.now();
    const expiresAt = now + EXPIRY_DAYS * 24 * 60 * 60 * 1000;

    const preference: AgePreference = {
      ageRange,
      timestamp: now,
      expiresAt,
    };

    localStorage.setItem(AGE_KEY, JSON.stringify(preference));
    localStorage.setItem(AGE_TIMESTAMP_KEY, now.toString());

    // Mark as shown this session
    sessionStorage.setItem(AGE_PROMPT_SHOWN_KEY, 'true');

    console.log('👤 Age saved:', ageRange);
  } catch (error) {
    console.error('Error saving age to storage:', error);
  }
}

/**
 * Clear user age from storage
 */
export function clearUserAge(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(AGE_KEY);
    localStorage.removeItem(AGE_TIMESTAMP_KEY);
    console.log('👤 Age cleared');
  } catch (error) {
    console.error('Error clearing age from storage:', error);
  }
}

/**
 * Mark that age prompt was shown (for this session)
 */
export function markAgePromptShown(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(AGE_PROMPT_SHOWN_KEY, 'true');
}

/**
 * Get age for analytics tracking
 * Returns user-provided age if available, null otherwise
 */
export function getAgeForTracking(): UserAge | null {
  const age = getUserAge();
  if (!age) return null;

  return {
    ageRange: age.ageRange,
  };
}

/**
 * Check if age data is valid
 */
export function isValidAge(age: any): age is UserAge {
  return (
    age &&
    typeof age.ageRange === 'string' &&
    age.ageRange.trim().length > 0
  );
}

