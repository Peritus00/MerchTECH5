'use strict';

/**
 * Token Evaluation Engine (server-side)
 *
 * Shared gate-decision logic. The TypeScript mirror at lib/events/tokenEvaluation.ts
 * must remain identical in semantics so client and server cannot diverge.
 *
 * All time calculations are performed in the event's timezone using the
 * Intl.DateTimeFormat API so that "daily" resets at 04:00 event-local time,
 * not at midnight UTC.
 */

const ROLE_HIERARCHY = ['door_scanner', 'seller', 'credential_desk', 'event_manager', 'super_admin'];

/**
 * Returns the Date of the most recent daily reset for this event.
 * Default reset time is 04:00 in the event's timezone; configurable via event.daily_reset_time.
 *
 * @param {object} event - { timezone: string, daily_reset_time: string } e.g. 'America/Chicago', '04:00:00'
 * @param {Date} now
 * @returns {Date} - the most recent reset wall-clock instant as a UTC Date
 */
function getLastResetInstant(event, now = new Date()) {
  const [resetHour, resetMin, resetSec] = (event.daily_reset_time || '04:00:00')
    .split(':')
    .map(Number);

  // Get current date components in the event's timezone
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

  const p = {};
  for (const part of parts) p[part.type] = part.value;

  // Build today's reset moment in local time, then convert to UTC
  const todayResetLocal = new Date(
    `${p.year}-${p.month}-${p.day}T${String(resetHour).padStart(2, '0')}:${String(resetMin).padStart(2, '0')}:${String(resetSec).padStart(2, '0')}`
  );

  // Interpret that local datetime in the event timezone
  const todayResetUTC = localToUTC(todayResetLocal, event.timezone);

  if (now >= todayResetUTC) {
    return todayResetUTC;
  }
  // Before today's reset: last reset was yesterday
  const yesterday = new Date(todayResetUTC);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return yesterday;
}

/**
 * Converts a naive local Date object to UTC, interpreting it in the given IANA timezone.
 * Works by exploiting the offset difference between UTC and the target zone.
 */
function localToUTC(localDate, timezone) {
  const utcStr = localDate.toLocaleString('en-US', { timeZone: 'UTC' });
  const localStr = localDate.toLocaleString('en-US', { timeZone: timezone });
  const diff = new Date(utcStr) - new Date(localStr);
  return new Date(localDate.getTime() + diff);
}

/**
 * Check whether the current time falls within a token's time window.
 * window_start_time and window_end_time are TIME strings ('HH:MM:SS') in event-local time.
 *
 * @param {object} token - { window_start_time, window_end_time }
 * @param {object} event - { timezone }
 * @param {Date} now
 * @returns {boolean}
 */
function isWithinTimeWindow(token, event, now = new Date()) {
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
 * Core gate decision function.
 *
 * @param {object} params
 * @param {object} params.ticket        - { id, public_code, revoked_at }
 * @param {object} params.zoneToken     - { entry_limit, exit_limit, window_start_time, window_end_time, reset_policy }
 *                                        null if access level has no token for this zone
 * @param {object} params.zoneState     - { entries_used, exits_used, last_reset_on } or null for unknown Trust-mode tickets
 * @param {string} params.direction     - 'entry' | 'exit'
 * @param {object} params.event         - { timezone, daily_reset_time }
 * @param {Date}   [params.now]         - defaults to new Date()
 * @returns {{ granted: boolean, denyReason: string|null, updatedState: object }}
 */
function evaluateGateDecision({ ticket, zoneToken, zoneState, direction, event, now = new Date() }) {
  // Revoked tickets never pass
  if (ticket.revoked_at) {
    return { granted: false, denyReason: 'revoked', updatedState: null };
  }

  // No token config for this zone means no access
  if (!zoneToken) {
    return { granted: false, denyReason: 'no_access_to_zone', updatedState: null };
  }

  // Time window check
  if (!isWithinTimeWindow(zoneToken, event, now)) {
    return { granted: false, denyReason: 'outside_time_window', updatedState: null };
  }

  // Build working state (Trust-mode unknown tickets start fresh at zero)
  let state = zoneState
    ? { entries_used: zoneState.entries_used, exits_used: zoneState.exits_used, last_reset_on: zoneState.last_reset_on }
    : { entries_used: 0, exits_used: 0, last_reset_on: null };

  // Apply daily reset if policy requires it
  if (zoneToken.reset_policy === 'daily') {
    const lastReset = getLastResetInstant(event, now);
    const lastResetDate = lastReset.toISOString().split('T')[0];
    if (!state.last_reset_on || state.last_reset_on < lastResetDate) {
      state = { entries_used: 0, exits_used: 0, last_reset_on: lastResetDate };
    }
  }

  // Count limit check
  if (direction === 'entry') {
    if (zoneToken.entry_limit !== null && zoneToken.entry_limit !== undefined) {
      if (state.entries_used >= zoneToken.entry_limit) {
        return { granted: false, denyReason: 'entry_limit_reached', updatedState: null };
      }
    }
    const updatedState = {
      ...state,
      entries_used: state.entries_used + 1,
      last_reset_on: state.last_reset_on || now.toISOString().split('T')[0],
    };
    return { granted: true, denyReason: null, updatedState: updatedState };
  }

  if (direction === 'exit') {
    if (zoneToken.exit_limit !== null && zoneToken.exit_limit !== undefined) {
      if (state.exits_used >= zoneToken.exit_limit) {
        return { granted: false, denyReason: 'exit_limit_reached', updatedState: null };
      }
    }
    const updatedState = {
      ...state,
      exits_used: state.exits_used + 1,
      last_reset_on: state.last_reset_on || now.toISOString().split('T')[0],
    };
    return { granted: true, denyReason: null, updatedState: updatedState };
  }

  return { granted: false, denyReason: 'invalid_direction', updatedState: null };
}

/**
 * Returns true if actingRole can grant/revoke targetRole.
 * event_manager can manage up to their own tier; super_admin manages all.
 *
 * @param {string} actingRole
 * @param {string} targetRole
 * @returns {boolean}
 */
function canManageRole(actingRole, targetRole) {
  const actingIndex = ROLE_HIERARCHY.indexOf(actingRole);
  const targetIndex = ROLE_HIERARCHY.indexOf(targetRole);
  if (actingIndex === -1 || targetIndex === -1) return false;
  return actingIndex >= targetIndex;
}

module.exports = {
  evaluateGateDecision,
  getLastResetInstant,
  isWithinTimeWindow,
  canManageRole,
  ROLE_HIERARCHY,
};
