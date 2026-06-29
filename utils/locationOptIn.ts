export type LocationOptInScope = {
  contentType: string;
  contentId: string | number;
  leadId?: number | null;
};

export function getLocationOptInStorageKey({ contentType, contentId, leadId }: LocationOptInScope): string {
  return `geo_opt_in_${contentType}_${contentId}_${leadId ?? 'anon'}`;
}

export function getLocationOptInDecision(scope: LocationOptInScope): 'accepted' | 'declined' | null {
  if (typeof window === 'undefined') return null;
  const value = sessionStorage.getItem(getLocationOptInStorageKey(scope));
  if (value === 'accepted' || value === 'declined') return value;
  return null;
}

export function markLocationOptInAccepted(scope: LocationOptInScope): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(getLocationOptInStorageKey(scope), 'accepted');
}

export function markLocationOptInDeclined(scope: LocationOptInScope): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(getLocationOptInStorageKey(scope), 'declined');
}

export function shouldPromptForLocation(scope: LocationOptInScope): boolean {
  if (typeof window === 'undefined') return false;
  if (!('geolocation' in navigator)) return false;
  return getLocationOptInDecision(scope) == null;
}

export async function requestBrowserLocation(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error('Geolocation timeout')), 8000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timeoutId);
        resolve(pos);
      },
      (err) => {
        clearTimeout(timeoutId);
        reject(err);
      },
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 8000 }
    );
  });
}
