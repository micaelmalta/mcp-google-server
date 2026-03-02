import { describe, it, expect, vi, beforeEach } from 'vitest';
import './_setup.js';
import { loadCalendarTools, registeredTools, mockCalendarList } from './_setup.js';

describe('google_calendar_list_calendars tool', () => {
  beforeEach(async () => {
    await loadCalendarTools();
    vi.clearAllMocks();
  });

  it('returns markdown list of calendars', async () => {
    mockCalendarList.mockResolvedValue({
      data: {
        items: [
          { id: 'primary', summary: 'My Calendar', description: 'Main', primary: true, accessRole: 'owner' },
          { id: 'other@group.calendar.google.com', summary: 'Team', primary: false, accessRole: 'writer' },
        ],
      },
    });

    const handler = registeredTools.get('google_calendar_list_calendars')!;
    const result = (await handler({ response_format: 'markdown' })) as {
      content: { type: string; text: string }[];
      structuredContent: { calendars: unknown[] };
    };

    expect(result.content[0].text).toContain('# Your Calendars (2)');
    expect(result.content[0].text).toContain('My Calendar');
    expect(result.content[0].text).toContain('(Primary)');
    expect(result.content[0].text).toContain('Team');
    expect(result.structuredContent.calendars).toHaveLength(2);
  });

  it('returns JSON when response_format is json', async () => {
    mockCalendarList.mockResolvedValue({
      data: { items: [{ id: 'primary', summary: 'Cal', description: '', primary: true, accessRole: 'owner' }] },
    });

    const handler = registeredTools.get('google_calendar_list_calendars')!;
    const result = (await handler({ response_format: 'json' })) as { content: { type: string; text: string }[] };

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.calendars).toHaveLength(1);
    expect(parsed.calendars[0].id).toBe('primary');
  });

  it('includes description when calendar has description', async () => {
    mockCalendarList.mockResolvedValue({
      data: {
        items: [
          { id: 'primary', summary: 'Work', description: 'My work calendar', primary: true, accessRole: 'owner' },
        ],
      },
    });

    const handler = registeredTools.get('google_calendar_list_calendars')!;
    const result = (await handler({ response_format: 'markdown' })) as {
      content: { type: string; text: string }[];
    };

    expect(result.content[0].text).toContain('Description');
    expect(result.content[0].text).toContain('My work calendar');
  });

  it('returns error on API failure', async () => {
    mockCalendarList.mockRejectedValue(new Error('Not authenticated'));

    const handler = registeredTools.get('google_calendar_list_calendars')!;
    const result = (await handler({ response_format: 'markdown' })) as {
      isError: boolean;
      content: { type: string; text: string }[];
    };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Not authenticated');
  });
});
