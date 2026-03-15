import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadGmailTools,
  registeredTools,
  mockSettingsFiltersCreate,
} from './_setup.js';

describe('google_gmail_create_filter', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await loadGmailTools();
  });

  it('creates a filter with criteria and action, returns new filter', async () => {
    mockSettingsFiltersCreate.mockResolvedValue({
      data: {
        id: 'new-filter',
        criteria: { from: 'promo@store.com' },
        action: { addLabelIds: ['Label_promos'], removeLabelIds: ['INBOX', 'UNREAD'] },
      },
    });
    const handler = registeredTools.get('google_gmail_create_filter')!;
    const result = await handler({
      from: 'promo@store.com',
      add_labels: 'Label_promos',
      skip_inbox: true,
      mark_as_read: true,
    }) as any;

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent.filter.id).toBe('new-filter');
    expect(mockSettingsFiltersCreate).toHaveBeenCalledWith({
      userId: 'me',
      requestBody: {
        criteria: { from: 'promo@store.com' },
        action: {
          addLabelIds: ['Label_promos'],
          removeLabelIds: ['INBOX', 'UNREAD'],
        },
      },
    });
  });

  it('deduplicates label IDs when booleans overlap explicit labels', async () => {
    mockSettingsFiltersCreate.mockResolvedValue({
      data: {
        id: 'new-filter',
        criteria: { from: 'promo@store.com' },
        action: { addLabelIds: ['IMPORTANT'], removeLabelIds: ['INBOX'] },
      },
    });
    const handler = registeredTools.get('google_gmail_create_filter')!;
    await handler({
      from: 'promo@store.com',
      add_labels: 'IMPORTANT',
      mark_as_important: true,
      remove_labels: 'INBOX',
      skip_inbox: true,
    });

    const call = mockSettingsFiltersCreate.mock.calls[0][0];
    expect(call.requestBody.action.addLabelIds).toEqual(['IMPORTANT']);
    expect(call.requestBody.action.removeLabelIds).toEqual(['INBOX']);
  });

  it('returns error when no criteria provided', async () => {
    const handler = registeredTools.get('google_gmail_create_filter')!;
    const result = await handler({ add_labels: 'Label_123' }) as any;

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('criteria');
    expect(mockSettingsFiltersCreate).not.toHaveBeenCalled();
  });

  it('returns error when no action provided', async () => {
    const handler = registeredTools.get('google_gmail_create_filter')!;
    const result = await handler({ from: 'test@example.com' }) as any;

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('action');
    expect(mockSettingsFiltersCreate).not.toHaveBeenCalled();
  });

  it('propagates API errors', async () => {
    mockSettingsFiltersCreate.mockRejectedValue(new Error('Invalid filter'));
    const handler = registeredTools.get('google_gmail_create_filter')!;
    const result = await handler({
      from: 'test@example.com',
      skip_inbox: true,
    }) as any;

    expect(result.isError).toBe(true);
  });
});
