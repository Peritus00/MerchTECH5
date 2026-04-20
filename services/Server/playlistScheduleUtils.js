/**
 * Playlist media schedule validation (mirrors shared/playlistSchedule.ts for Node).
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(s) {
  if (!s || typeof s !== 'string' || !ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T12:00:00`);
  return !Number.isNaN(d.getTime());
}

function weekdayForIsoDate(s) {
  return new Date(`${s}T12:00:00`).getUTCDay();
}

function isDateInRangeInclusive(dateStr, start, end) {
  return dateStr >= start && dateStr <= end;
}

function recurringMatches(rules, dateStr) {
  if (!rules || !rules.length) return false;
  const wd = weekdayForIsoDate(dateStr);
  for (const r of rules) {
    if (r && r.kind === 'weekly' && Array.isArray(r.weekdays)) {
      if (r.weekdays.some((d) => Number(d) === wd)) return true;
    }
  }
  return false;
}

function isPlaylistItemActiveOnDate(schedule, dateStr) {
  if (!schedule.scheduleEnabled) return true;
  const start = schedule.scheduleStartDate;
  const end = schedule.scheduleEndDate;
  if (!start || !isValidIsoDate(start)) return false;
  if (dateStr < start) return false;
  if (end) {
    if (!isValidIsoDate(end)) return false;
    if (!isDateInRangeInclusive(dateStr, start, end)) return false;
  }
  const exact = schedule.scheduleExactDates || [];
  const rules = schedule.scheduleRecurringRules || [];
  const inExact = exact.includes(dateStr);
  const inRecurring = recurringMatches(rules, dateStr);
  if (exact.length === 0 && rules.length === 0) return false;
  if (exact.length > 0 && rules.length > 0) return inExact || inRecurring;
  if (exact.length > 0) return inExact;
  return inRecurring;
}

function validatePlaylistMediaScheduleItems(items) {
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
    if (!start) {
      return { ok: false, error: 'Scheduled items require a start date.' };
    }
    if (!isValidIsoDate(start) || (end != null && !isValidIsoDate(end))) {
      return { ok: false, error: 'Invalid schedule date format. Use YYYY-MM-DD.' };
    }
    if (end && start > end) {
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
      if (d < start || (end && d > end)) {
        return {
          ok: false,
          error: `Exact date ${d} must fall on or after the item's start date and before its expiration date when one is set.`,
        };
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
  if (scheduledItems.some((i) => !i.scheduleEndDate)) {
    return { ok: true };
  }
  const minStart = scheduledItems.reduce(
    (acc, i) => (i.scheduleStartDate < acc ? i.scheduleStartDate : acc),
    scheduledItems[0].scheduleStartDate
  );
  const maxEnd = scheduledItems.reduce(
    (acc, i) => (i.scheduleEndDate > acc ? i.scheduleEndDate : acc),
    scheduledItems[0].scheduleEndDate
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

function normalizePlaylistItemFromBody(raw, displayOrder) {
  const mediaId = raw.mediaId != null ? raw.mediaId : raw.media_id;
  const scheduleEnabled = !!(raw.scheduleEnabled ?? raw.schedule_enabled);
  let exact = raw.scheduleExactDates ?? raw.schedule_exact_dates ?? [];
  let rules = raw.scheduleRecurringRules ?? raw.schedule_recurring_rules ?? [];
  if (typeof exact === 'string') {
    try {
      exact = JSON.parse(exact);
    } catch {
      exact = [];
    }
  }
  if (typeof rules === 'string') {
    try {
      rules = JSON.parse(rules);
    } catch {
      rules = [];
    }
  }
  if (!Array.isArray(exact)) exact = [];
  if (!Array.isArray(rules)) rules = [];

  let start = raw.scheduleStartDate ?? raw.schedule_start_date ?? null;
  let end = raw.scheduleEndDate ?? raw.schedule_end_date ?? null;
  if (start && typeof start !== 'string') start = toIsoDateString(start);
  if (end && typeof end !== 'string') end = toIsoDateString(end);

  return {
    mediaId: Number(mediaId),
    displayOrder,
    scheduleEnabled,
    scheduleStartDate: scheduleEnabled ? start : null,
    scheduleEndDate: scheduleEnabled ? end : null,
    scheduleExactDates: scheduleEnabled ? exact.map(String) : [],
    scheduleRecurringRules: scheduleEnabled ? rules : [],
  };
}

function toIsoDateString(v) {
  if (!v) return null;
  if (typeof v === 'string') return v.slice(0, 10);
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

module.exports = {
  isValidIsoDate,
  isPlaylistItemActiveOnDate,
  validatePlaylistMediaScheduleItems,
  normalizePlaylistItemFromBody,
  toIsoDateString,
};
