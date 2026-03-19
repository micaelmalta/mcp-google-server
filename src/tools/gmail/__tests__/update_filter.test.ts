import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadGmailTools,
  registeredTools,
  mockSettingsFiltersDelete,
  mockSettingsFiltersCreate,
} from './_setup.js';

describe('google_gmail_update_filter', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await loadGmailTools();
  });

  it('deletes old filter then creates new one, returns new filter', async () => {
    mockSettingsFiltersDelete.mockResolvedValue({ data: {} });
    mockSettingsFiltersCreate.mockResolvedValue({
      data: {
        id: 'new-filter-id',
        criteria: { from: 'updated@example.com' },
        action: { addLabelIds: [], removeLabelIds: ['INBOX'] },
      },
    });
    const handler = registeredTools.get('google_gmail_update_filter')!;
    const result = (await handler({
      filter_id: 'old-filter-id',
      from: 'updated@example.com',
      skip_inbox: true,
    })) as {
      content: { type: string; text: string }[];
      structuredContent: { filter: { id: string } };
    };

    expect(result.isError).toBeUndefined();
    expect(mockSettingsFiltersDelete).toHaveBeenCalledWith({ userId: 'me', id: 'old-filter-id' });
    expect(mockSettingsFiltersCreate).toHaveBeenCalled();
    expect(result.structuredContent.filter.id).toBe('new-filter-id');
    expect(result.content[0].text).toContain('new-filter-id');
  });

  it('does not call create if delete fails', async () => {
    mockSettingsFiltersDelete.mockRejectedValue(new Error('Filter not found'));
    const handler = registeredTools.get('google_gmail_update_filter')!;
    const result = (await handler({
      filter_id: 'bad-id',
      from: 'test@example.com',
      skip_inbox: true,
    })) as {
      isError: boolean;
      content: { type: string; text: string }[];
    };

    expect(result.isError).toBe(true);
    expect(mockSettingsFiltersCreate).not.toHaveBeenCalled();
  });

  it('returns error (no API calls) when no criteria provided', async () => {
    const handler = registeredTools.get('google_gmail_update_filter')!;
    const result = (await handler({ filter_id: 'filter1', skip_inbox: true })) as {
      isError: boolean;
      content: { type: string; text: string }[];
    };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('criteria');
    expect(mockSettingsFiltersDelete).not.toHaveBeenCalled();
    expect(mockSettingsFiltersCreate).not.toHaveBeenCalled();
  });

  it('returns error (no API calls) when no action provided', async () => {
    const handler = registeredTools.get('google_gmail_update_filter')!;
    const result = (await handler({ filter_id: 'filter1', from: 'test@example.com' })) as {
      isError: boolean;
      content: { type: string; text: string }[];
    };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('action');
    expect(mockSettingsFiltersDelete).not.toHaveBeenCalled();
    expect(mockSettingsFiltersCreate).not.toHaveBeenCalled();
  });
});
