import { describe, it, expect, vi, beforeEach } from 'vitest';
import './_setup.js';
import { loadCalendarTools, registeredTools, mockEventsGet } from './_setup.js';

describe('google_calendar_get_event tool', () => {
  beforeEach(async () => {
    await loadCalendarTools();
    vi.clearAllMocks();
  });

  it('returns event details in markdown', async () => {
    mockEventsGet.mockResolvedValue({
      data: {
        id: 'ev1',
        summary: 'Team Standup',
        description: 'Daily sync',
        start: { dateTime: '2026-03-01T09:00:00Z' },
        end: { dateTime: '2026-03-01T09:15:00Z' },
        location: '',
        htmlLink: 'https://calendar.google.com/event/ev1',
        creator: { email: 'a@example.com', displayName: 'Alice' },
        organizer: { email: 'a@example.com', displayName: 'Alice' },
        attendees: [],
        attachments: [],
      },
    });

    const handler = registeredTools.get('google_calendar_get_event')!;
    const result = (await handler({
      calendar_id: 'primary',
      event_id: 'ev1',
      response_format: 'markdown',
    })) as { content: { type: string; text: string }[]; structuredContent: { id: string; summary: string } };

    expect(result.content[0].text).toContain('Team Standup');
    expect(result.structuredContent.id).toBe('ev1');
    expect(result.structuredContent.summary).toBe('Team Standup');
  });

  it('includes description, attachments, and attendees in markdown', async () => {
    mockEventsGet.mockResolvedValue({
      data: {
        id: 'ev2',
        summary: 'Full Event',
        description: 'Event description text',
        start: { dateTime: '2026-03-01T09:00:00Z' },
        end: { dateTime: '2026-03-01T10:00:00Z' },
        location: 'Room 1',
        htmlLink: 'https://calendar.google.com/event/ev2',
        creator: { email: 'c@example.com', displayName: 'Creator' },
        organizer: { email: 'o@example.com', displayName: 'Organizer' },
        attendees: [
          { email: 'a@example.com', displayName: 'Alice', responseStatus: 'accepted' },
          { email: 'b@example.com', displayName: 'Bob', responseStatus: 'needsAction' },
        ],
        attachments: [
          { fileUrl: 'https://drive.google.com/file/d/1/view', title: 'Doc link' },
        ],
      },
    });

    const handler = registeredTools.get('google_calendar_get_event')!;
    const result = (await handler({
      calendar_id: 'primary',
      event_id: 'ev2',
      response_format: 'markdown',
    })) as { content: { type: string; text: string }[] };

    expect(result.content[0].text).toContain('Full Event');
    expect(result.content[0].text).toContain('Event description text');
    expect(result.content[0].text).toContain('Attachments');
    expect(result.content[0].text).toContain('Doc link');
    expect(result.content[0].text).toContain('Attendees');
    expect(result.content[0].text).toContain('Alice');
    expect(result.content[0].text).toContain('accepted');
  });

  it('returns JSON when response_format is json', async () => {
    mockEventsGet.mockResolvedValue({
      data: {
        id: 'ev-json',
        summary: 'JSON Event',
        start: { dateTime: '2026-03-01T10:00:00Z' },
        end: { dateTime: '2026-03-01T11:00:00Z' },
        htmlLink: 'https://calendar.google.com/event/ev-json',
        creator: {},
        organizer: {},
        attendees: [],
        attachments: [],
      },
    });

    const handler = registeredTools.get('google_calendar_get_event')!;
    const result = (await handler({
      calendar_id: 'primary',
      event_id: 'ev-json',
      response_format: 'json',
    })) as { content: { type: string; text: string }[] };

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.id).toBe('ev-json');
    expect(parsed.summary).toBe('JSON Event');
  });

  it('returns error on API failure', async () => {
    mockEventsGet.mockRejectedValue(new Error('Event not found 404'));

    const handler = registeredTools.get('google_calendar_get_event')!;
    const result = (await handler({
      calendar_id: 'primary',
      event_id: 'bad',
      response_format: 'markdown',
    })) as { isError: boolean; content: { type: string; text: string }[] };

    expect(result.isError).toBe(true);
  });
});
