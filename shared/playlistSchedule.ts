/**
 * Playlist media scheduling: types and date logic (shared client/server-safe).
 * Dates are calendar dates in YYYY-MM-DD (local intent; compare as strings for ISO dates).
 */

export type PlaylistRecurringRule = {
  kind: 'weekly';
  /** 0 = Sunday … 6 = Saturday */
  weekdays: number[];
};

export interface PlaylistMediaScheduleFields {
  scheduleEnabled: boolean;
  scheduleStartDate: string | null;
  scheduleEndDate: string | null;
  scheduleExactDates: string[];
  scheduleRecurringRules: PlaylistRecurringRule[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T12:00:00`);
  return !Number.isNaN(d.getTime());
}

export function parseIsoDateUtcNoon(s: string): Date {
  return new Date(`${s}T12:00:00`);
}

/** JS getUTCDay for a YYYY-MM-DD interpreted at UTC noon (stable weekday). */
export function weekdayForIsoDate(s: string): number {
  return parseIsoDateUtcNoon(s).getUTCDay();
}

export function isDateInRangeInclusive(dateStr: string, start: string, end: string): boolean {
  return dateStr >= start && dateStr <= end;
}

function recurringMatches(rules: PlaylistRecurringRule[], dateStr: string): boolean {
  if (!rules?.length) return false;
  const wd = weekdayForIsoDate(dateStr);
  for (const r of rules) {
    if (r?.kind === 'weekly' && Array.isArray(r.weekdays)) {
      if (r.weekdays.some((d) => Number(d) === wd)) return true;
    }
  }
  return false;
}

/**
 * When schedule is disabled, item is always eligible.
 * When enabled: must be in [start,end], and (exact match OR recurring match).
 * If exactDates and recurring are both empty while enabled, never active (invalid config).
 */
export function isPlaylistItemActiveOnDate(
  schedule: PlaylistMediaScheduleFields,
  dateStr: string
): boolean {
  if (!schedule.scheduleEnabled) return true;
  const start = schedule.scheduleStartDate;
  const end = schedule.scheduleEndDate;
  if (!start || !end || !isValidIsoDate(start) || !isValidIsoDate(end)) return false;
  if (!isDateInRangeInclusive(dateStr, start, end)) return false;
  const exact = schedule.scheduleExactDates || [];
  const rules = schedule.scheduleRecurringRules || [];
  const inExact = exact.includes(dateStr);
  const inRecurring = recurringMatches(rules, dateStr);
  if (exact.length === 0 && rules.length === 0) return false;
  if (exact.length > 0 && rules.length > 0) return inExact || inRecurring;
  if (exact.length > 0) return inExact;
  return inRecurring;
}

export function todayIsoDateInLocalTimezone(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export interface PlaylistItemForValidation extends PlaylistMediaScheduleFields {
  mediaId: number;
}

export function validatePlaylistMediaScheduleItems(
  items: PlaylistItemForValidation[]
): { ok: true } | { ok: false; error: string } {
  if (!items.length) {
    return { ok: false, error: 'Playlist must contain at least one media item.' };
  }

  const anyScheduled = items.some((i) => i.scheduleEnabled);
  const anyAlwaysOn = items.some((i) => !i.scheduleEnabled);

  if (anyScheduled && !anyAlwaysOn) {
    return {
      ok: false,
      error:
        'When any item uses the calendar, at least one item must stay unscheduled so the channel always has content after schedules end.',
    };
  }

  for (const it of items) {
    if (!it.scheduleEnabled) continue;
    const start = it.scheduleStartDate;
    const end = it.scheduleEndDate;
    if (!start || !end) {
      return { ok: false, error: 'Scheduled items require both a start date and an expiration date.' };
    }
    if (!isValidIsoDate(start) || !isValidIsoDate(end)) {
      return { ok: false, error: 'Invalid schedule date format. Use YYYY-MM-DD.' };
    }
    if (start > end) {
      return { ok: false, error: 'Schedule start date cannot be after the expiration date.' };
    }
    const exact = it.scheduleExactDates || [];
    const rules = it.scheduleRecurringRules || [];
    if (exact.length === 0 && rules.length === 0) {
      return {
        ok: false,
        error: 'Scheduled items need at least one specific date or a recurring weekday pattern.',
      };
    }
    for (const d of exact) {
      if (!isValidIsoDate(d)) {
        return { ok: false, error: `Invalid exact date: ${d}` };
      }
      if (!isDateInRangeInclusive(d, start, end)) {
        return { ok: false, error: `Exact date ${d} must fall within the item's start and expiration range.` };
      }
    }
    for (const r of rules) {
      if (!r || r.kind !== 'weekly' || !Array.isArray(r.weekdays) || r.weekdays.length === 0) {
        return { ok: false, error: 'Recurring rules must be weekly with at least one weekday.' };
      }
      for (const wd of r.weekdays) {
        if (typeof wd !== 'number' || wd < 0 || wd > 6 || !Number.isInteger(wd)) {
          return { ok: false, error: 'Weekdays must be integers 0 (Sunday) through 6 (Saturday).' };
        }
      }
    }
  }

  if (!anyScheduled) {
    return { ok: true };
  }

  const scheduledItems = items.filter((i) => i.scheduleEnabled);
  const minStart = scheduledItems.reduce(
    (acc, i) => (i.scheduleStartDate! < acc ? i.scheduleStartDate! : acc),
    scheduledItems[0].scheduleStartDate!
  );
  const maxEnd = scheduledItems.reduce(
    (acc, i) => (i.scheduleEndDate! > acc ? i.scheduleEndDate! : acc),
    scheduledItems[0].scheduleEndDate!
  );

  const cursor = new Date(`${minStart}T12:00:00`);
  const endD = new Date(`${maxEnd}T12:00:00`);
  const maxIterations = 4000;
  let iterations = 0;

  while (cursor <= endD && iterations < maxIterations) {
    iterations++;
    const y = cursor.getUTCFullYear();
    const m = String(cursor.getUTCMonth() + 1).padStart(2, '0');
    const day = String(cursor.getUTCDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${day}`;

    let covered = false;
    for (const it of items) {
      if (isPlaylistItemActiveOnDate(it, dateStr)) {
        covered = true;
        break;
      }
    }
    if (!covered) {
      return {
        ok: false,
        error: `No media is scheduled for ${dateStr}. Add coverage for that day or an unscheduled item.`,
      };
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  if (iterations >= maxIterations) {
    return { ok: false, error: 'Schedule range is too large to validate.' };
  }

  return { ok: true };
}
