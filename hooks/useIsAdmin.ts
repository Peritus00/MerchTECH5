import { useAuth } from '@/contexts/AuthContext';

/**
 * Returns true if the current user has admin privileges.
 * Centralizes the isAdmin check so the email/username fallbacks
 * exist in exactly one place.
 */
export function useIsAdmin(): boolean {
  const { user } = useAuth();
  if (!user) return false;
  return (
    user.isAdmin === true ||
    user.email === 'djjetfuel@gmail.com' ||
    user.username === 'djjetfuel'
  );
}
