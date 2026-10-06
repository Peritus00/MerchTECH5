export const playlistDisclaimerStorageKey = (playlistId: string) =>
  `playlist_disclaimer_accepted_${playlistId}`;

export const hasStoredDisclaimerAcceptance = (stored: string | null) =>
  stored === 'true';
