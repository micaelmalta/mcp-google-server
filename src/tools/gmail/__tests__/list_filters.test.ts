import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadGmailTools,
  registeredTools,
  mockSettingsFiltersList,
} from './_setup.js';

const SAMPLE_FILTERS = [
  {
    id: 'filter1',
    criteria: { from: 'boss@company.com' },
    action: { addLabelIds: ['STARRED'], removeLabelIds: ['INBOX'] },
  },
  {
    id: 'filter2',
    criteria: { subject: 'newsletter' },
    action: { addLabelIds: [], removeLabelIds: ['UNREAD'] },
  },
];

describe('google_gmail_list_filters', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await loadGmailTools();
  });

  it('returns markdown listing all filters', async () => {
    mockSettingsFiltersList.mockResolvedValue({ data: { filter: SAMPLE_FILTERS } });
    const handler = registeredTools.get('google_gmail_list_filters')!;
    const result = await handler({ response_format: 'markdown' }) as any;

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('filter1');
    expect(result.content[0].text).toContain('boss@company.com');
    expect(result.structuredContent.filters).toHaveLength(2);
    expect(result.structuredContent.filters[0].id).toBe('filter1');
  });

  it('returns "No filters found" when list is empty', async () => {
    mockSettingsFiltersList.mockResolvedValue({ data: { filter: [] } });
    const handler = registeredTools.get('google_gmail_list_filters')!;
    const result = await handler({ response_format: 'markdown' }) as any;

    expect(result.content[0].text).toContain('No filters');
    expect(result.structuredContent.filters).toHaveLength(0);
  });

  it('returns JSON when response_format is json', async () => {
    mockSettingsFiltersList.mockResolvedValue({ data: { filter: SAMPLE_FILTERS } });
    const handler = registeredTools.get('google_gmail_list_filters')!;
    const result = await handler({ response_format: 'json' }) as any;

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.filters).toHaveLength(2);
  });

  it('propagates API errors', async () => {
    mockSettingsFiltersList.mockRejectedValue(new Error('API error'));
    const handler = registeredTools.get('google_gmail_list_filters')!;
    const result = await handler({ response_format: 'markdown' }) as any;

    expect(result.isError).toBe(true);
  });
});
