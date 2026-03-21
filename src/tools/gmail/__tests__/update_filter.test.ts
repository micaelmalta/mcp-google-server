import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadGmailTools,
  registeredTools,
  mockSettingsFiltersGet,
  mockSettingsFiltersDelete,
  mockSettingsFiltersCreate,
} from './_setup.js';

const SAMPLE_ORIGINAL_FILTER = {
  data: {
    id: 'old-filter-id',
    criteria: { from: 'old@example.com' },
    action: { addLabelIds: ['STARRED'], removeLabelIds: [] },
  },
};

describe('google_gmail_update_filter', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await loadGmailTools();
  });

  it('deletes old filter then creates new one, returns new filter', async () => {
    mockSettingsFiltersGet.mockResolvedValue(SAMPLE_ORIGINAL_FILTER);
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
    mockSettingsFiltersGet.mockResolvedValue(SAMPLE_ORIGINAL_FILTER);
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

  it('returns descriptive error with original settings when delete succeeds but create fails', async () => {
    mockSettingsFiltersGet.mockResolvedValue(SAMPLE_ORIGINAL_FILTER);
    mockSettingsFiltersDelete.mockResolvedValue({ data: {} });
    mockSettingsFiltersCreate.mockRejectedValue(new Error('Invalid label'));
    const handler = registeredTools.get('google_gmail_update_filter')!;
    const result = (await handler({
      filter_id: 'old-filter-id',
      from: 'test@example.com',
      skip_inbox: true,
    })) as {
      isError: boolean;
      content: { type: string; text: string }[];
    };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('old-filter-id');
    expect(result.content[0].text).toContain('deleted but creating the replacement failed');
    expect(result.content[0].text).toContain('old@example.com');
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
