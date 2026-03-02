import { describe, it, expect, vi, beforeEach } from 'vitest';
import './_setup.js';
import { loadCalendarTools, registeredTools, mockFreebusyQuery } from './_setup.js';

describe('google_calendar_get_freebusy tool', () => {
  beforeEach(async () => {
    await loadCalendarTools();
    vi.clearAllMocks();
  });

  it('returns free/busy for calendars', async () => {
    mockFreebusyQuery.mockResolvedValue({
      data: {
        calendars: {
          primary: {
            busy: [{ start: '2026-03-01T10:00:00Z', end: '2026-03-01T11:00:00Z' }],
            errors: [],
          },
          'other@group.calendar.google.com': { busy: [], errors: [] },
        },
      },
    });

    const handler = registeredTools.get('google_calendar_get_freebusy')!;
    const result = (await handler({
      calendar_ids: 'primary,other@group.calendar.google.com',
      time_min: '2026-03-01T00:00:00Z',
      time_max: '2026-03-01T23:59:59Z',
    })) as {
      content: { type: string; text: string }[];
      structuredContent: { calendars: { calendar_id: string; busy: unknown[] }[] };
    };

    expect(result.content[0].text).toContain('Free/Busy');
    expect(result.structuredContent.calendars).toHaveLength(2);
    const primary = result.structuredContent.calendars.find((c) => c.calendar_id === 'primary');
    expect(primary?.busy).toHaveLength(1);
  });

  it('shows free when calendar has no busy periods', async () => {
    mockFreebusyQuery.mockResolvedValue({
      data: {
        calendars: {
          primary: { busy: [], errors: [] },
        },
      },
    });

    const handler = registeredTools.get('google_calendar_get_freebusy')!;
    const result = (await handler({
      calendar_ids: 'primary',
      time_min: '2026-03-01T00:00:00Z',
      time_max: '2026-03-01T23:59:59Z',
    })) as { content: { type: string; text: string }[] };

    expect(result.content[0].text).toContain('Free for the entire period');
  });

  it('includes calendar errors in result when API returns errors', async () => {
    mockFreebusyQuery.mockResolvedValue({
      data: {
        calendars: {
          'bad@example.com': { busy: [], errors: [{ domain: 'global', reason: 'forbidden' }] },
        },
      },
    });

    const handler = registeredTools.get('google_calendar_get_freebusy')!;
    const result = (await handler({
      calendar_ids: 'bad@example.com',
      time_min: '2026-03-01T00:00:00Z',
      time_max: '2026-03-01T23:59:59Z',
    })) as { structuredContent: { calendars: { calendar_id: string; errors: unknown[] }[] } };

    const cal = result.structuredContent.calendars[0];
    expect(cal.calendar_id).toBe('bad@example.com');
    expect(cal.errors).toHaveLength(1);
  });

  it('returns error on API failure', async () => {
    mockFreebusyQuery.mockRejectedValue(new Error('Invalid time range'));

    const handler = registeredTools.get('google_calendar_get_freebusy')!;
    const result = (await handler({
      calendar_ids: 'primary',
      time_min: '2026-03-01T00:00:00Z',
      time_max: '2026-03-01T23:59:59Z',
    })) as { isError: boolean };

    expect(result.isError).toBe(true);
  });
});
