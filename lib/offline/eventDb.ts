/**
 * Dexie offline database for the scanner PWA.
 *
 * Tables:
 *   roster      - ticket/attendee records keyed on public_code
 *   tokens      - access_level_zone_token configs (pre-flight cached)
 *   photos      - Blob cache for attendee photos (non-blocking; cached after text roster)
 *   scanQueue   - append-only offline scan queue
 *   ticketState - local mirror of ticket_zone_state for offline gate decisions
 *   cryptoKeys  - per-event ECDSA public key (from pre-flight response)
 *   meta        - key/value store (roster_version, last_sync_timestamp, etc.)
 */

import Dexie, { type Table } from 'dexie';

export interface RosterEntry {
  public_code: string;      // primary key — the QR code value
  ticket_id: number;
  event_id: number;
  access_level_id: number | null;
  attendee_id: number | null;
  has_photo: boolean;       // true if photo_s3_key exists on the server record
  photo_status: 'none' | 'pending' | 'approved';
  revoked_at: string | null;
  updated_at: string;
}

export interface ZoneTokenEntry {
  // compound key: [event_id, access_level_id, zone_id]
  event_id: number;
  access_level_id: number;
  zone_id: number;
  entry_limit: number | null;
  exit_limit: number | null;
  window_start_time: string | null;
  window_end_time: string | null;
  reset_policy: 'daily' | 'camping' | 'none';
}

export interface PhotoEntry {
  attendee_id: number;      // primary key
  blob: Blob;
  cached_at: number;        // Date.now() timestamp
}

export interface ScanQueueEntry {
  id?: number;              // auto-increment
  client_scan_uuid: string; // UUID set at scan time; used for server-side idempotency
  event_id: number;
  public_code: string;
  zone_id: number;
  direction: 'entry' | 'exit';
  result: 'granted' | 'denied';
  deny_reason: string | null;
  validation_mode_used: 'strict' | 'trust' | 'manual_override';
  was_offline: boolean;
  scanned_at: string;       // ISO 8601 device clock
  uploaded: boolean;
}

export interface TicketStateEntry {
  // compound key: [ticket_id, zone_id]
  ticket_id: number;
  zone_id: number;
  is_inside: boolean;
  entries_used: number;
  exits_used: number;
  last_reset_on: string | null; // 'YYYY-MM-DD'
}

export interface CryptoKeyEntry {
  key_id: string;           // primary key
  event_id: number;
  public_key: string;       // PEM public key
  algorithm: string;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

class EventDb extends Dexie {
  roster!: Table<RosterEntry, string>;
  tokens!: Table<ZoneTokenEntry, [number, number, number]>;
  photos!: Table<PhotoEntry, number>;
  scanQueue!: Table<ScanQueueEntry, number>;
  ticketState!: Table<TicketStateEntry, [number, number]>;
  cryptoKeys!: Table<CryptoKeyEntry, string>;
  meta!: Table<MetaEntry, string>;

  constructor() {
    super('merchtechapp-scanner');
    this.version(1).stores({
      roster:      'public_code, event_id, ticket_id, access_level_id',
      tokens:      '[event_id+access_level_id+zone_id], access_level_id, zone_id',
      photos:      'attendee_id, cached_at',
      scanQueue:   '++id, [event_id+uploaded], client_scan_uuid, scanned_at',
      ticketState: '[ticket_id+zone_id], ticket_id',
      cryptoKeys:  'key_id, event_id',
      meta:        'key',
    });
  }
}

// Guard against SSR / Node.js environments where IndexedDB is unavailable.
// All actual Dexie calls happen inside useEffect or event handlers (browser-only),
// so the stub is never invoked at runtime — it only satisfies the module import.
export const eventDb: EventDb = (typeof window !== 'undefined' && 'indexedDB' in window)
  ? new EventDb()
  : ({} as EventDb);
