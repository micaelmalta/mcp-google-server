import { describe, it, expect, vi, beforeEach } from 'vitest';
import './_setup.js';
import { loadCalendarTools, registeredTools, mockEventsDelete } from './_setup.js';

describe('google_calendar_delete_event tool', () => {
  beforeEach(async () => {
    await loadCalendarTools();
    vi.clearAllMocks();
  });

  it('deletes event and returns success message', async () => {
    mockEventsDelete.mockResolvedValue(undefined);

    const handler = registeredTools.get('google_calendar_delete_event')!;
    const result = (await handler({ calendar_id: 'primary', event_id: 'ev1' })) as {
      content: { type: string; text: string }[];
    };

    expect(mockEventsDelete).toHaveBeenCalledWith({
      calendarId: 'primary',
      eventId: 'ev1',
    });
    expect(result.content[0].text).toContain('ev1');
    expect(result.content[0].text).toContain('deleted successfully');
  });

  it('returns error on API failure', async () => {
    mockEventsDelete.mockRejectedValue(new Error('Not found 404'));

    const handler = registeredTools.get('google_calendar_delete_event')!;
    const result = (await handler({ calendar_id: 'primary', event_id: 'bad' })) as {
      isError: boolean;
      content: { type: string; text: string }[];
    };

    expect(result.isError).toBe(true);
  });
});
