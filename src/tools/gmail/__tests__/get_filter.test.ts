import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadGmailTools,
  registeredTools,
  mockSettingsFiltersGet,
} from './_setup.js';

const SAMPLE_FILTER = {
  id: 'filter1',
  criteria: { from: 'boss@company.com', subject: 'urgent' },
  action: { addLabelIds: ['STARRED', 'IMPORTANT'], removeLabelIds: ['INBOX'] },
};

describe('google_gmail_get_filter', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await loadGmailTools();
  });

  it('returns a single filter in markdown', async () => {
    mockSettingsFiltersGet.mockResolvedValue({ data: SAMPLE_FILTER });
    const handler = registeredTools.get('google_gmail_get_filter')!;
    const result = (await handler({ filter_id: 'filter1', response_format: 'markdown' })) as {
      content: { type: string; text: string }[];
      structuredContent: { filter: { id: string; action: { addLabelIds: string[] } } };
    };

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('filter1');
    expect(result.content[0].text).toContain('boss@company.com');
    expect(result.content[0].text).toContain('urgent');
    expect(result.structuredContent.filter.id).toBe('filter1');
    expect(result.structuredContent.filter.action.addLabelIds).toContain('STARRED');
  });

  it('returns JSON when response_format is json', async () => {
    mockSettingsFiltersGet.mockResolvedValue({ data: SAMPLE_FILTER });
    const handler = registeredTools.get('google_gmail_get_filter')!;
    const result = (await handler({ filter_id: 'filter1', response_format: 'json' })) as {
      content: { type: string; text: string }[];
    };

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.filter.id).toBe('filter1');
  });

  it('propagates API error for unknown filter ID', async () => {
    mockSettingsFiltersGet.mockRejectedValue(new Error('Filter not found'));
    const handler = registeredTools.get('google_gmail_get_filter')!;
    const result = (await handler({ filter_id: 'bad-id', response_format: 'markdown' })) as {
      isError: boolean;
      content: { type: string; text: string }[];
    };

    expect(result.isError).toBe(true);
  });
});
