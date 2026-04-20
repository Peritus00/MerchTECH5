import {
  isPlaylistItemActiveOnDate,
  validatePlaylistMediaScheduleItems,
} from '../playlistSchedule';

describe('playlist scheduling', () => {
  it('treats a missing end date as an indefinite schedule', () => {
    const schedule = {
      mediaId: 1,
      scheduleEnabled: true,
      scheduleStartDate: '2026-04-19',
      scheduleEndDate: null,
      scheduleExactDates: [],
      scheduleRecurringRules: [{ kind: 'weekly' as const, weekdays: [1, 3] }],
    };

    expect(isPlaylistItemActiveOnDate(schedule, '2026-04-20')).toBe(true);
    expect(isPlaylistItemActiveOnDate(schedule, '2026-04-22')).toBe(true);
    expect(isPlaylistItemActiveOnDate(schedule, '2026-04-18')).toBe(false);
  });

  it('accepts scheduled items without an end date during validation', () => {
    const result = validatePlaylistMediaScheduleItems([
      {
        mediaId: 1,
        scheduleEnabled: true,
        scheduleStartDate: '2026-04-19',
        scheduleEndDate: null,
        scheduleExactDates: [],
        scheduleRecurringRules: [{ kind: 'weekly' as const, weekdays: [1, 3] }],
      },
      {
        mediaId: 2,
        scheduleEnabled: false,
        scheduleStartDate: null,
        scheduleEndDate: null,
        scheduleExactDates: [],
        scheduleRecurringRules: [],
      },
    ]);

    expect(result).toEqual({ ok: true });
  });

  it('still rejects exact dates before the start date', () => {
    const result = validatePlaylistMediaScheduleItems([
      {
        mediaId: 1,
        scheduleEnabled: true,
        scheduleStartDate: '2026-04-19',
        scheduleEndDate: null,
        scheduleExactDates: ['2026-04-18'],
        scheduleRecurringRules: [],
      },
      {
        mediaId: 2,
        scheduleEnabled: false,
        scheduleStartDate: null,
        scheduleEndDate: null,
        scheduleExactDates: [],
        scheduleRecurringRules: [],
      },
    ]);

    expect(result.ok).toBe(false);
  });
});
