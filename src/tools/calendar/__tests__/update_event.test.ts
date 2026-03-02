import { describe, it, expect, vi, beforeEach } from 'vitest';
import './_setup.js';
import { loadCalendarTools, registeredTools, mockEventsGet, mockEventsPatch } from './_setup.js';

describe('google_calendar_update_event tool', () => {
  beforeEach(async () => {
    await loadCalendarTools();
    vi.clearAllMocks();
  });

  it('updates event and returns success', async () => {
    mockEventsPatch.mockResolvedValue({
      data: {
        id: 'ev1',
        summary: 'Updated Title',
        start: { dateTime: '2026-03-01T10:00:00Z' },
        htmlLink: 'https://calendar.google.com/event/ev1',
        conferenceData: null,
      },
    });

    const handler = registeredTools.get('google_calendar_update_event')!;
    const result = (await handler({
      calendar_id: 'primary',
      event_id: 'ev1',
      summary: 'Updated Title',
    })) as { content: { type: string; text: string }[]; structuredContent: { event_id: string } };

    expect(mockEventsPatch).toHaveBeenCalledWith(
      expect.objectContaining({
        calendarId: 'primary',
        eventId: 'ev1',
        requestBody: expect.objectContaining({ summary: 'Updated Title' }),
      })
    );
    expect(result.structuredContent.event_id).toBe('ev1');
  });

  it('merges add_attendees with existing attendees', async () => {
    mockEventsGet.mockResolvedValue({
      data: {
        id: 'ev1',
        attendees: [
          { email: 'existing@example.com' },
        ],
      },
    });
    mockEventsPatch.mockResolvedValue({
      data: {
        id: 'ev1',
        summary: 'Event',
        start: { dateTime: '2026-03-01T10:00:00Z' },
        htmlLink: 'https://calendar.google.com/event/ev1',
        conferenceData: null,
      },
    });

    const handler = registeredTools.get('google_calendar_update_event')!;
    await handler({
      calendar_id: 'primary',
      event_id: 'ev1',
      add_attendees: 'new@example.com',
    });

    expect(mockEventsGet).toHaveBeenCalledWith(
      expect.objectContaining({ calendarId: 'primary', eventId: 'ev1' })
    );
    expect(mockEventsPatch).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          attendees: expect.arrayContaining([
            expect.objectContaining({ email: 'existing@example.com' }),
            expect.objectContaining({ email: 'new@example.com' }),
          ]),
        }),
      })
    );
  });

  it('replaces attendees when attendees provided (no add_attendees)', async () => {
    mockEventsPatch.mockResolvedValue({
      data: {
        id: 'ev1',
        summary: 'Event',
        start: { dateTime: '2026-03-01T10:00:00Z' },
        htmlLink: 'https://calendar.google.com/event/ev1',
        conferenceData: null,
      },
    });

    const handler = registeredTools.get('google_calendar_update_event')!;
    await handler({
      calendar_id: 'primary',
      event_id: 'ev1',
      attendees: 'only@example.com',
    });

    expect(mockEventsGet).not.toHaveBeenCalled();
    expect(mockEventsPatch).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          attendees: [{ email: 'only@example.com' }],
        }),
      })
    );
  });

  it('does not duplicate attendee when add_attendees includes existing email', async () => {
    mockEventsGet.mockResolvedValue({
      data: {
        id: 'ev1',
        attendees: [{ email: 'existing@example.com' }],
      },
    });
    mockEventsPatch.mockResolvedValue({
      data: {
        id: 'ev1',
        summary: 'Event',
        start: { dateTime: '2026-03-01T10:00:00Z' },
        htmlLink: 'https://calendar.google.com/event/ev1',
        conferenceData: null,
      },
    });

    const handler = registeredTools.get('google_calendar_update_event')!;
    await handler({
      calendar_id: 'primary',
      event_id: 'ev1',
      add_attendees: 'existing@example.com,new@example.com',
    });

    const patchCall = mockEventsPatch.mock.calls[0];
    const attendees = (patchCall?.[0] as { requestBody: { attendees: { email: string }[] } })?.requestBody?.attendees ?? [];
    expect(attendees).toHaveLength(2);
    expect(attendees.map((a) => a.email)).toEqual(['existing@example.com', 'new@example.com']);
  });

  it('uses time_zone in start and end when provided', async () => {
    mockEventsPatch.mockResolvedValue({
      data: {
        id: 'ev1',
        summary: 'Event',
        start: { dateTime: '2026-03-01T10:00:00-05:00' },
        end: { dateTime: '2026-03-01T11:00:00-05:00' },
        htmlLink: 'https://calendar.google.com/event/ev1',
        conferenceData: null,
      },
    });

    const handler = registeredTools.get('google_calendar_update_event')!;
    await handler({
      calendar_id: 'primary',
      event_id: 'ev1',
      start_time: '2026-03-01T10:00:00',
      end_time: '2026-03-01T11:00:00',
      time_zone: 'America/New_York',
    });

    expect(mockEventsPatch).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          start: { dateTime: '2026-03-01T10:00:00', timeZone: 'America/New_York' },
          end: { dateTime: '2026-03-01T11:00:00', timeZone: 'America/New_York' },
        }),
      })
    );
  });

  it('includes meet link when add_meet_link is true', async () => {
    mockEventsPatch.mockResolvedValue({
      data: {
        id: 'ev1',
        summary: 'With Meet',
        start: { dateTime: '2026-03-01T10:00:00Z' },
        htmlLink: 'https://calendar.google.com/event/ev1',
        conferenceData: {
          entryPoints: [
            { entryPointType: 'video', uri: 'https://meet.google.com/abc-defg-hij' },
          ],
        },
      },
    });

    const handler = registeredTools.get('google_calendar_update_event')!;
    const result = (await handler({
      calendar_id: 'primary',
      event_id: 'ev1',
      add_meet_link: true,
    })) as { content: { type: string; text: string }[]; structuredContent: { meet_link: string } };

    expect(mockEventsPatch).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          conferenceData: expect.objectContaining({
            createRequest: expect.objectContaining({ conferenceSolutionKey: { type: 'hangoutsMeet' } }),
          }),
        }),
      })
    );
    expect(result.structuredContent.meet_link).toBe('https://meet.google.com/abc-defg-hij');
    expect(result.content[0].text).toContain('Meet');
  });

  it('returns error on API failure', async () => {
    mockEventsPatch.mockRejectedValue(new Error('Forbidden'));

    const handler = registeredTools.get('google_calendar_update_event')!;
    const result = (await handler({
      calendar_id: 'primary',
      event_id: 'ev1',
      summary: 'New',
    })) as { isError: boolean };

    expect(result.isError).toBe(true);
  });
});
