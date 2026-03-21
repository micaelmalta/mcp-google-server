import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadGmailTools,
  registeredTools,
  mockSettingsFiltersDelete,
} from './_setup.js';

describe('google_gmail_delete_filter', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await loadGmailTools();
  });

  it('deletes a filter and returns confirmation', async () => {
    mockSettingsFiltersDelete.mockResolvedValue({ data: {} });
    const handler = registeredTools.get('google_gmail_delete_filter')!;
    const result = (await handler({ filter_id: 'filter1' })) as {
      content: { type: string; text: string }[];
      structuredContent: { filter_id: string };
    };

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('filter1');
    expect(result.structuredContent.filter_id).toBe('filter1');
    expect(mockSettingsFiltersDelete).toHaveBeenCalledWith({ userId: 'me', id: 'filter1' });
  });

  it('propagates API error', async () => {
    mockSettingsFiltersDelete.mockRejectedValue(new Error('Filter not found'));
    const handler = registeredTools.get('google_gmail_delete_filter')!;
    const result = (await handler({ filter_id: 'bad-id' })) as {
      isError: boolean;
      content: { type: string; text: string }[];
    };

    expect(result.isError).toBe(true);
  });
});
