import { describe, it, expect, vi, beforeEach } from 'vitest';
import './_setup.js';
import { loadCalendarTools, registeredTools, mockEventsList } from './_setup.js';

describe('google_calendar_list_events tool', () => {
  beforeEach(async () => {
    await loadCalendarTools();
    vi.clearAllMocks();
  });

  it('returns markdown list of events', async () => {
    mockEventsList.mockResolvedValue({
      data: {
        items: [
          {
            id: 'ev1',
            summary: 'Meeting',
            start: { dateTime: '2026-03-01T10:00:00Z' },
            end: { dateTime: '2026-03-01T11:00:00Z' },
            location: 'Room A',
            htmlLink: 'https://calendar.google.com/event/ev1',
            attendees: [],
            attachments: [],
          },
        ],
        nextPageToken: undefined,
      },
    });

    const handler = registeredTools.get('google_calendar_list_events')!;
    const result = (await handler({ calendar_id: 'primary', response_format: 'markdown' })) as {
      content: { type: string; text: string }[];
      structuredContent: { events: unknown[] };
    };

    expect(result.content[0].text).toContain('# Events from calendar: primary');
    expect(result.content[0].text).toContain('Meeting');
    expect(result.structuredContent.events).toHaveLength(1);
  });

  it('includes location, attachments, and attendees in markdown', async () => {
    mockEventsList.mockResolvedValue({
      data: {
        items: [
          {
            id: 'ev2',
            summary: 'Team Sync',
            start: { dateTime: '2026-03-02T09:00:00Z' },
            end: { dateTime: '2026-03-02T09:30:00Z' },
            location: 'Conference Room',
            htmlLink: 'https://calendar.google.com/event/ev2',
            attendees: [
              { email: 'alice@example.com', displayName: 'Alice' },
              { email: 'bob@example.com', displayName: 'Bob' },
            ],
            attachments: [
              { fileUrl: 'https://drive.google.com/file/d/x/view', title: 'Agenda' },
            ],
          },
        ],
        nextPageToken: 'token-next',
      },
    });

    const handler = registeredTools.get('google_calendar_list_events')!;
    const result = (await handler({ calendar_id: 'primary', response_format: 'markdown' })) as {
      content: { type: string; text: string }[];
      structuredContent: { next_page_token: string; has_more: boolean };
    };

    expect(result.content[0].text).toContain('Conference Room');
    expect(result.content[0].text).toContain('Attachments');
    expect(result.content[0].text).toContain('Agenda');
    expect(result.content[0].text).toContain('Attendees');
    expect(result.content[0].text).toContain('alice@example.com');
    expect(result.content[0].text).toContain('page_token="token-next"');
    expect(result.structuredContent.has_more).toBe(true);
  });

  it('omits location and shows attachments/attendees when present', async () => {
    mockEventsList.mockResolvedValue({
      data: {
        items: [
          {
            id: 'ev-no-loc',
            summary: 'No Location',
            start: { dateTime: '2026-03-01T10:00:00Z' },
            end: { dateTime: '2026-03-01T11:00:00Z' },
            location: '',
            htmlLink: 'https://calendar.google.com/event/ev-no-loc',
            attendees: [{ email: 'a@example.com', displayName: 'Alice' }],
            attachments: [{ fileUrl: 'https://drive.google.com/file/d/1', title: 'Slide' }],
          },
        ],
        nextPageToken: undefined,
      },
    });

    const handler = registeredTools.get('google_calendar_list_events')!;
    const result = (await handler({ calendar_id: 'primary', response_format: 'markdown' })) as {
      content: { type: string; text: string }[];
      structuredContent: { has_more: boolean };
    };

    expect(result.content[0].text).toContain('No Location');
    expect(result.content[0].text).toContain('Attachments');
    expect(result.content[0].text).toContain('Slide');
    expect(result.content[0].text).toContain('Attendees');
    expect(result.content[0].text).toContain('a@example.com');
    expect(result.structuredContent.has_more).toBe(false);
  });

  it('returns JSON when response_format is json', async () => {
    mockEventsList.mockResolvedValue({
      data: {
        items: [
          {
            id: 'e1',
            summary: 'One',
            start: { dateTime: '2026-03-01T10:00:00Z' },
            end: { dateTime: '2026-03-01T11:00:00Z' },
            htmlLink: 'https://calendar.google.com/event/e1',
            attendees: [],
            attachments: [],
          },
        ],
        nextPageToken: 'tok',
      },
    });

    const handler = registeredTools.get('google_calendar_list_events')!;
    const result = (await handler({
      calendar_id: 'primary',
      response_format: 'json',
    })) as { content: { type: string; text: string }[] };

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.events).toHaveLength(1);
    expect(parsed.next_page_token).toBe('tok');
    expect(parsed.has_more).toBe(true);
  });

  it('returns error on API failure', async () => {
    mockEventsList.mockRejectedValue(new Error('Not found 404'));

    const handler = registeredTools.get('google_calendar_list_events')!;
    const result = (await handler({ calendar_id: 'primary', response_format: 'markdown' })) as {
      isError: boolean;
      content: { type: string; text: string }[];
    };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not found');
  });
});
