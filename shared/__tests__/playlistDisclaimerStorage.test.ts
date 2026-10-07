import {
  hasStoredDisclaimerAcceptance,
  playlistDisclaimerStorageKey,
  createDisclaimerAcceptance,
} from '../../utils/playlistDisclaimerStorage';

describe('playlist disclaimer storage', () => {
  it('uses a stable per-playlist AsyncStorage key', () => {
    expect(playlistDisclaimerStorageKey('85')).toBe(
      'playlist_disclaimer_accepted_85'
    );
  });

  it('returns false for null or invalid values', () => {
    expect(hasStoredDisclaimerAcceptance(null)).toBe(false);
    expect(hasStoredDisclaimerAcceptance('false')).toBe(false);
    expect(hasStoredDisclaimerAcceptance('invalid')).toBe(false);
    expect(hasStoredDisclaimerAcceptance('{}')).toBe(false);
  });

  it('returns false for legacy "true" format (forces re-acceptance)', () => {
    // Old format should be treated as expired to get timestamp
    expect(hasStoredDisclaimerAcceptance('true')).toBe(false);
  });

  it('returns true for recently created acceptance', () => {
    const stored = createDisclaimerAcceptance();
    expect(hasStoredDisclaimerAcceptance(stored)).toBe(true);
  });

  it('returns false for expired acceptance (>24 hours)', () => {
    const oneDayAgo = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
    const expiredAcceptance = JSON.stringify({
      accepted: true,
      timestamp: oneDayAgo,
    });
    expect(hasStoredDisclaimerAcceptance(expiredAcceptance)).toBe(false);
  });

  it('returns true for acceptance within 24 hours', () => {
    const twentyHoursAgo = Date.now() - 20 * 60 * 60 * 1000;
    const validAcceptance = JSON.stringify({
      accepted: true,
      timestamp: twentyHoursAgo,
    });
    expect(hasStoredDisclaimerAcceptance(validAcceptance)).toBe(true);
  });

  it('createDisclaimerAcceptance returns valid JSON with timestamp', () => {
    const stored = createDisclaimerAcceptance();
    const parsed = JSON.parse(stored);
    
    expect(parsed.accepted).toBe(true);
    expect(typeof parsed.timestamp).toBe('number');
    expect(parsed.timestamp).toBeLessThanOrEqual(Date.now());
    expect(parsed.timestamp).toBeGreaterThan(Date.now() - 1000); // Within last second
  });
});
