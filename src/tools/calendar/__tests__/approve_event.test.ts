import { describe, it, expect, vi, beforeEach } from 'vitest';
import './_setup.js';
import { loadCalendarTools, registeredTools, mockEventsGet, mockEventsPatch } from './_setup.js';

describe('google_calendar_approve_event tool', () => {
  beforeEach(async () => {
    await loadCalendarTools();
    vi.clearAllMocks();
  });

  it('returns error when self attendee not found', async () => {
    mockEventsGet.mockResolvedValue({
      data: {
        id: 'ev1',
        summary: 'Meeting',
        start: { dateTime: '2026-03-01T10:00:00Z' },
        attendees: [{ email: 'other@example.com', responseStatus: 'needsAction' }],
      },
    });

    const handler = registeredTools.get('google_calendar_approve_event')!;
    const result = (await handler({ calendar_id: 'primary', event_id: 'ev1' })) as {
      isError: boolean;
      content: { type: string; text: string }[];
    };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Could not find your attendee entry');
  });

  it('accepts event when self attendee found', async () => {
    mockEventsGet.mockResolvedValue({
      data: {
        id: 'ev1',
        summary: 'Invited Meeting',
        start: { dateTime: '2026-03-01T10:00:00Z' },
        attendees: [
          { email: 'me@example.com', responseStatus: 'needsAction', self: true },
          { email: 'other@example.com', responseStatus: 'accepted' },
        ],
      },
    });
    mockEventsPatch.mockResolvedValue({});

    const handler = registeredTools.get('google_calendar_approve_event')!;
    const result = (await handler({ calendar_id: 'primary', event_id: 'ev1' })) as {
      content: { type: string; text: string }[];
      structuredContent: { accepted: boolean };
    };

    expect(mockEventsPatch).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarId: 'primary',
        eventId: 'ev1',
        requestBody: { attendees: expect.any(Array) },
        sendUpdates: 'all',
      })
    );
    expect(result.structuredContent.accepted).toBe(true);
  });

  it('returns error when patch fails', async () => {
    mockEventsGet.mockResolvedValue({
      data: {
        id: 'ev1',
        summary: 'Meeting',
        start: { dateTime: '2026-03-01T10:00:00Z' },
        attendees: [{ email: 'me@example.com', responseStatus: 'needsAction', self: true }],
      },
    });
    mockEventsPatch.mockRejectedValue(new Error('Calendar API error'));

    const handler = registeredTools.get('google_calendar_approve_event')!;
    const result = (await handler({ calendar_id: 'primary', event_id: 'ev1' })) as {
      isError: boolean;
      content: { type: string; text: string }[];
    };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Calendar API error');
  });

  it('preserves other attendees without responseStatus when accepting', async () => {
    mockEventsGet.mockResolvedValue({
      data: {
        id: 'ev1',
        summary: 'Multi',
        start: { dateTime: '2026-03-01T10:00:00Z' },
        attendees: [
          { email: 'me@example.com', responseStatus: 'needsAction', self: true },
          { email: 'other@example.com' },
        ],
      },
    });
    mockEventsPatch.mockResolvedValue({});

    const handler = registeredTools.get('google_calendar_approve_event')!;
    await handler({ calendar_id: 'primary', event_id: 'ev1' });

    const patchCall = mockEventsPatch.mock.calls[0];
    const attendees = patchCall?.[0]?.requestBody?.attendees as { email: string; responseStatus?: string }[];
    expect(attendees).toHaveLength(2);
    expect(attendees.find((a) => a.email === 'me@example.com')?.responseStatus).toBe('accepted');
    expect(attendees.find((a) => a.email === 'other@example.com')).toEqual({ email: 'other@example.com' });
  });
});
