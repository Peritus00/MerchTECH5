import {
  hasStoredDisclaimerAcceptance,
  playlistDisclaimerStorageKey,
} from '../../utils/playlistDisclaimerStorage';

describe('playlist disclaimer storage', () => {
  it('uses a stable per-playlist AsyncStorage key', () => {
    expect(playlistDisclaimerStorageKey('85')).toBe(
      'playlist_disclaimer_accepted_85'
    );
  });

  it('only treats explicit true as accepted', () => {
    expect(hasStoredDisclaimerAcceptance('true')).toBe(true);
    expect(hasStoredDisclaimerAcceptance(null)).toBe(false);
    expect(hasStoredDisclaimerAcceptance('false')).toBe(false);
  });
});
