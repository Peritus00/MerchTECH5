/**
 * Pre-flight sync utility
 *
 * Downloads the roster, zone token config, and signing key for an event.
 * Photo download is non-blocking — photos are streamed in the background after
 * the text roster is populated, so scanners can begin scanning immediately.
 *
 * NTP drift detection: calculates the ms offset between the device clock and
 * server_time in the pre-flight response. Returns a warning if drift > 30 seconds.
 */

import { eventDb, RosterEntry, ZoneTokenEntry, CryptoKeyEntry } from './eventDb';
import { api } from '@/services/api';

const DRIFT_WARNING_THRESHOLD_MS = 30_000;

export interface PreflightResult {
  rosterCount: number;
  tokenCount: number;
  hasSigningKey: boolean;
  clockDriftMs: number;        // positive = device ahead of server
  clockDriftWarning: boolean;  // true if |drift| > 30s
  photoCachePromise: Promise<void>; // resolves when all photos are cached (non-blocking)
}

/**
 * Run pre-flight sync for a specific event.
 * Downloads the full roster in pages of 500 then triggers background photo caching.
 *
 * @param eventId - the event to sync
 * @param onProgress - optional progress callback (0–100)
 */
export async function runPreflight(
  eventId: number,
  onProgress?: (pct: number) => void,
): Promise<PreflightResult> {
  const localBefore = Date.now();

  let cursor: number | null = 0;
  let rosterCount = 0;
  let tokenCount = 0;
  let hasSigningKey = false;
  let clockDriftMs = 0;
  const photoAttendeeIds: number[] = [];

  let pageNum = 0;

  do {
    const params: Record<string, string> = { cursor: String(cursor) };
    const response = await api.get(`/events/${eventId}/preflight`, { params });
    const data = response.data;

    const localAfter = Date.now();
    const roundTripHalf = (localAfter - localBefore) / 2;

    // NTP drift check (only on first page)
    if (pageNum === 0) {
      const serverTime = new Date(data.server_time).getTime();
      clockDriftMs = localBefore + roundTripHalf - serverTime;
    }

    // Store signing key (idempotent — key_id is the PK)
    if (data.signing_key) {
      const keyEntry: CryptoKeyEntry = {
        key_id: data.signing_key.key_id,
        event_id: eventId,
        public_key: data.signing_key.public_key,
        algorithm: data.signing_key.algorithm,
      };
      await eventDb.cryptoKeys.put(keyEntry);
      hasSigningKey = true;
    }

    // Store zone tokens (first page only — they don't paginate)
    if (pageNum === 0 && data.access_level_zone_tokens) {
      const tokenEntries: ZoneTokenEntry[] = data.access_level_zone_tokens.map((t: any) => ({
        event_id: eventId,
        access_level_id: t.access_level_id,
        zone_id: t.zone_id,
        entry_limit: t.entry_limit,
        exit_limit: t.exit_limit,
        window_start_time: t.window_start_time,
        window_end_time: t.window_end_time,
        reset_policy: t.reset_policy,
      }));
      await eventDb.tokens.bulkPut(tokenEntries);
      tokenCount = tokenEntries.length;
    }

    // Store roster entries
    const rosterEntries: RosterEntry[] = data.tickets.map((t: any) => {
      if (t.attendee_id && t.has_photo) {
        photoAttendeeIds.push(t.attendee_id);
      }
      return {
        public_code: t.public_code,
        ticket_id: t.ticket_id,
        event_id: eventId,
        access_level_id: t.access_level_id ?? null,
        attendee_id: t.attendee_id ?? null,
        has_photo: t.has_photo ?? false,
        photo_status: t.photo_status ?? 'none',
        revoked_at: t.revoked_at ?? null,
        updated_at: t.updated_at,
      };
    });
    await eventDb.roster.bulkPut(rosterEntries);
    rosterCount += rosterEntries.length;

    cursor = data.next_cursor ?? null;
    pageNum++;
    if (onProgress) {
      onProgress(data.has_more ? Math.min(80, pageNum * 10) : 90);
    }
  } while (cursor !== null);

  // Store sync timestamp
  await eventDb.meta.put({ key: `roster_sync_${eventId}`, value: new Date().toISOString() });

  // Non-blocking photo cache — caller can display a loading indicator
  const photoCachePromise = cachePhotosInBackground(eventId, photoAttendeeIds, onProgress);

  return {
    rosterCount,
    tokenCount,
    hasSigningKey,
    clockDriftMs,
    clockDriftWarning: Math.abs(clockDriftMs) > DRIFT_WARNING_THRESHOLD_MS,
    photoCachePromise,
  };
}

/**
 * Background photo caching — does NOT block the scanner from starting.
 * Photos are fetched one at a time to avoid saturating cellular bandwidth.
 */
async function cachePhotosInBackground(
  eventId: number,
  attendeeIds: number[],
  onProgress?: (pct: number) => void,
): Promise<void> {
  for (let i = 0; i < attendeeIds.length; i++) {
    const attendeeId = attendeeIds[i];
    const cached = await eventDb.photos.get(attendeeId);
    if (cached) continue; // already cached

    try {
      const response = await fetch(
        `${process.env.EXPO_PUBLIC_API_URL}/events/${eventId}/attendees/${attendeeId}/photo`,
        { headers: { Authorization: `Bearer ${await getStoredToken()}` } }
      );
      if (!response.ok) continue;
      const blob = await response.blob();
      await eventDb.photos.put({ attendee_id: attendeeId, blob, cached_at: Date.now() });
    } catch (_) {
      // Network error during photo caching — skip silently; scanner still works with placeholder
    }

    if (onProgress && i % 10 === 0) {
      onProgress(90 + Math.round((i / attendeeIds.length) * 10));
    }
  }
  if (onProgress) onProgress(100);
}

async function getStoredToken(): Promise<string> {
  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
  return (await AsyncStorage.getItem('authToken')) || '';
}

/**
 * Returns the two-state photo URL for an attendee:
 *   - { status: 'cached', url: string }   — photo is in IndexedDB
 *   - { status: 'has_photo' }             — server says photo exists but not yet cached
 *   - { status: 'no_photo' }             — attendee never uploaded a photo
 */
export async function getPhotoState(
  attendeeId: number | null,
  hasPhoto: boolean,
): Promise<{ status: 'cached'; url: string } | { status: 'has_photo' | 'no_photo' }> {
  if (!attendeeId) return { status: 'no_photo' };
  if (!hasPhoto) return { status: 'no_photo' };

  const cached = await eventDb.photos.get(attendeeId);
  if (cached) {
    return { status: 'cached', url: URL.createObjectURL(cached.blob) };
  }
  return { status: 'has_photo' };
}

/**
 * Flush the pending scan queue for an event to the server.
 * Deduplication is handled server-side via client_scan_uuid.
 */
export async function flushScanQueue(eventId: number): Promise<void> {
  const pending = await eventDb.scanQueue
    .where('[event_id+uploaded]')
    .equals([eventId, 0])
    .toArray();

  if (pending.length === 0) return;

  const response = await api.post(`/scan/${eventId}/batch`, {
    scans: pending.map(s => ({
      client_scan_uuid: s.client_scan_uuid,
      public_code: s.public_code,
      zone_id: s.zone_id,
      direction: s.direction,
      validation_mode_used: s.validation_mode_used,
      was_offline: s.was_offline,
      scanned_at: s.scanned_at,
    })),
  });

  if (response.status === 200 || response.status === 201) {
    const ids = pending.map(s => s.id!).filter(Boolean);
    await eventDb.scanQueue.where('id').anyOf(ids).modify({ uploaded: true });
  }
}
