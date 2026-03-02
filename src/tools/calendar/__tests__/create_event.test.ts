import { describe, it, expect, vi, beforeEach } from 'vitest';
import './_setup.js';
import { loadCalendarTools, registeredTools, mockEventsInsert } from './_setup.js';

describe('google_calendar_create_event tool', () => {
  beforeEach(async () => {
    await loadCalendarTools();
    vi.clearAllMocks();
  });

  it('returns error when neither all_day_date nor start/end provided', async () => {
    const handler = registeredTools.get('google_calendar_create_event')!;
    const result = (await handler({
      calendar_id: 'primary',
      summary: 'Test',
      response_format: 'markdown',
    })) as { isError: boolean; content: { type: string; text: string }[] };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('all_day_date or both start_time and end_time');
    expect(mockEventsInsert).not.toHaveBeenCalled();
  });

  it('creates timed event and returns event_id and link', async () => {
    mockEventsInsert.mockResolvedValue({
      data: {
        id: 'new-ev-1',
        summary: 'New Meeting',
        start: { dateTime: '2026-03-02T14:00:00Z' },
        end: { dateTime: '2026-03-02T15:00:00Z' },
        htmlLink: 'https://calendar.google.com/event/new-ev-1',
      },
    });

    const handler = registeredTools.get('google_calendar_create_event')!;
    const result = (await handler({
      calendar_id: 'primary',
      summary: 'New Meeting',
      start_time: '2026-03-02T14:00:00Z',
      end_time: '2026-03-02T15:00:00Z',
    })) as {
      content: { type: string; text: string }[];
      structuredContent: { event_id: string; html_link: string };
    };

    expect(mockEventsInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarId: 'primary',
        requestBody: expect.objectContaining({ summary: 'New Meeting' }),
      })
    );
    expect(result.structuredContent.event_id).toBe('new-ev-1');
    expect(result.structuredContent.html_link).toContain('new-ev-1');
  });

  it('creates all-day event when all_day_date provided', async () => {
    mockEventsInsert.mockResolvedValue({
      data: {
        id: 'all-day-1',
        summary: 'All Day',
        start: { date: '2026-03-15' },
        end: { date: '2026-03-15' },
        htmlLink: 'https://calendar.google.com/event/all-day-1',
      },
    });

    const handler = registeredTools.get('google_calendar_create_event')!;
    const result = (await handler({
      calendar_id: 'primary',
      summary: 'All Day',
      all_day_date: '2026-03-15',
    })) as { structuredContent: { event_id: string } };

    expect(mockEventsInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          summary: 'All Day',
          start: { date: '2026-03-15' },
          end: { date: '2026-03-15' },
        }),
      })
    );
    expect(result.structuredContent.event_id).toBe('all-day-1');
  });

  it('creates event with description, location, and attendees', async () => {
    mockEventsInsert.mockResolvedValue({
      data: {
        id: 'ev2',
        summary: 'With Attendees',
        start: { dateTime: '2026-03-03T10:00:00Z' },
        end: { dateTime: '2026-03-03T11:00:00Z' },
        htmlLink: 'https://calendar.google.com/event/ev2',
      },
    });

    const handler = registeredTools.get('google_calendar_create_event')!;
    await handler({
      calendar_id: 'primary',
      summary: 'With Attendees',
      start_time: '2026-03-03T10:00:00Z',
      end_time: '2026-03-03T11:00:00Z',
      description: 'Notes here',
      location: 'Room B',
      attendees: 'a@example.com, b@example.com',
    });

    expect(mockEventsInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          description: 'Notes here',
          location: 'Room B',
          attendees: [{ email: 'a@example.com' }, { email: 'b@example.com' }],
        }),
      })
    );
  });

  it('returns error on API failure', async () => {
    mockEventsInsert.mockRejectedValue(new Error('Invalid value'));

    const handler = registeredTools.get('google_calendar_create_event')!;
    const result = (await handler({
      calendar_id: 'primary',
      summary: 'Bad',
      start_time: '2026-03-02T14:00:00Z',
      end_time: '2026-03-02T15:00:00Z',
    })) as { isError: boolean };

    expect(result.isError).toBe(true);
  });
});
