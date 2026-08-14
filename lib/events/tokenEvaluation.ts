/**
 * Token Evaluation Engine (client-side TypeScript mirror)
 *
 * Must remain semantically identical to services/Server/lib/tokenEvaluation.js.
 * All time calculations use the Intl API so that daily resets fire at
 * event.daily_reset_time in the event's local timezone.
 */

export const ROLE_HIERARCHY = [
  'door_scanner',
  'seller',
  'credential_desk',
  'event_manager',
  'super_admin',
] as const;

export type EventRole = (typeof ROLE_HIERARCHY)[number];

export interface EventConfig {
  timezone: string;
  daily_reset_time: string; // 'HH:MM:SS'
}

export interface ZoneToken {
  entry_limit: number | null;
  exit_limit: number | null;
  window_start_time: string | null; // 'HH:MM:SS' in event timezone
  window_end_time: string | null;
  reset_policy: 'daily' | 'camping' | 'none';
}

export interface ZoneState {
  entries_used: number;
  exits_used: number;
  last_reset_on: string | null; // 'YYYY-MM-DD'
}

export interface Ticket {
  id: number;
  public_code: string;
  revoked_at: string | null;
}

export interface GateDecisionResult {
  granted: boolean;
  denyReason: string | null;
  updatedState: ZoneState | null;
}

/** Converts a naive local Date to UTC by computing the zone offset. */
function localToUTC(localDate: Date, timezone: string): Date {
  const utcStr = localDate.toLocaleString('en-US', { timeZone: 'UTC' });
  const localStr = localDate.toLocaleString('en-US', { timeZone: timezone });
  const diff = new Date(utcStr).getTime() - new Date(localStr).getTime();
  return new Date(localDate.getTime() + diff);
}

/**
 * Returns the most recent daily reset instant as a UTC Date.
 * Reset fires at event.daily_reset_time in the event's timezone (default 04:00:00).
 */
export function getLastResetInstant(event: EventConfig, now: Date = new Date()): Date {
  const [resetHour, resetMin, resetSec] = (event.daily_reset_time || '04:00:00')
    .split(':')
    .map(Number);

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: event.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const p: Record<string, string> = {};
  for (const part of parts) p[part.type] = part.value;

  const todayResetLocal = new Date(
    `${p.year}-${p.month}-${p.day}T${String(resetHour).padStart(2, '0')}:${String(resetMin).padStart(2, '0')}:${String(resetSec || 0).padStart(2, '0')}`
  );
  const todayResetUTC = localToUTC(todayResetLocal, event.timezone);

  if (now >= todayResetUTC) return todayResetUTC;

  const yesterday = new Date(todayResetUTC);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return yesterday;
}

/**
 * Returns true if `now` falls within the token's time window (event-timezone-aware).
 */
export function isWithinTimeWindow(
  token: Pick<ZoneToken, 'window_start_time' | 'window_end_time'>,
  event: EventConfig,
  now: Date = new Date()
): boolean {
  if (!token.window_start_time && !token.window_end_time) return true;

  const localTime = new Intl.DateTimeFormat('en-US', {
    timeZone: event.timezone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now);

  const [nowH, nowM, nowS] = localTime.split(':').map(Number);
  const nowSeconds = nowH * 3600 + nowM * 60 + nowS;

  let valid = true;
  if (token.window_start_time) {
    const [sh, sm, ss] = token.window_start_time.split(':').map(Number);
    valid = valid && nowSeconds >= sh * 3600 + sm * 60 + (ss || 0);
  }
  if (token.window_end_time) {
    const [eh, em, es] = token.window_end_time.split(':').map(Number);
    valid = valid && nowSeconds <= eh * 3600 + em * 60 + (es || 0);
  }
  return valid;
}

/**
 * Core gate decision.
 *
 * @param ticket      - the ticket being scanned
 * @param zoneToken   - access level zone token config; null = no access to this zone
 * @param zoneState   - current occupancy state; null for Trust-mode unknown tickets (start at 0)
 * @param direction   - 'entry' | 'exit'
 * @param event       - event config with timezone and daily_reset_time
 * @param now         - defaults to new Date()
 */
export function evaluateGateDecision({
  ticket,
  zoneToken,
  zoneState,
  direction,
  event,
  now = new Date(),
}: {
  ticket: Ticket;
  zoneToken: ZoneToken | null;
  zoneState: ZoneState | null;
  direction: 'entry' | 'exit';
  event: EventConfig;
  now?: Date;
}): GateDecisionResult {
  if (ticket.revoked_at) {
    return { granted: false, denyReason: 'revoked', updatedState: null };
  }

  if (!zoneToken) {
    return { granted: false, denyReason: 'no_access_to_zone', updatedState: null };
  }

  if (!isWithinTimeWindow(zoneToken, event, now)) {
    return { granted: false, denyReason: 'outside_time_window', updatedState: null };
  }

  // Trust-mode unknown tickets start fresh at zero for all counts
  let state: ZoneState = zoneState
    ? { ...zoneState }
    : { entries_used: 0, exits_used: 0, last_reset_on: null };

  // Daily reset check
  if (zoneToken.reset_policy === 'daily') {
    const lastReset = getLastResetInstant(event, now);
    const lastResetDate = lastReset.toISOString().split('T')[0];
    if (!state.last_reset_on || state.last_reset_on < lastResetDate) {
      state = { entries_used: 0, exits_used: 0, last_reset_on: lastResetDate };
    }
  }

  if (direction === 'entry') {
    if (zoneToken.entry_limit !== null && state.entries_used >= zoneToken.entry_limit) {
      return { granted: false, denyReason: 'entry_limit_reached', updatedState: null };
    }
    return {
      granted: true,
      denyReason: null,
      updatedState: {
        ...state,
        entries_used: state.entries_used + 1,
        last_reset_on: state.last_reset_on ?? now.toISOString().split('T')[0],
      },
    };
  }

  if (direction === 'exit') {
    if (zoneToken.exit_limit !== null && state.exits_used >= zoneToken.exit_limit) {
      return { granted: false, denyReason: 'exit_limit_reached', updatedState: null };
    }
    return {
      granted: true,
      denyReason: null,
      updatedState: {
        ...state,
        exits_used: state.exits_used + 1,
        last_reset_on: state.last_reset_on ?? now.toISOString().split('T')[0],
      },
    };
  }

  return { granted: false, denyReason: 'invalid_direction', updatedState: null };
}

/**
 * Returns true if actingRole can grant/revoke targetRole.
 * event_manager can manage roles up to their own tier; super_admin manages all.
 */
export function canManageRole(actingRole: EventRole, targetRole: EventRole): boolean {
  const actingIndex = ROLE_HIERARCHY.indexOf(actingRole);
  const targetIndex = ROLE_HIERARCHY.indexOf(targetRole);
  if (actingIndex === -1 || targetIndex === -1) return false;
  return actingIndex >= targetIndex;
}
