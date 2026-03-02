import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PersonEntry } from '../index.js';

vi.mock('../../../auth/oauth.js', () => ({ requireAuth: () => ({}) }));

import './_setup.js';
import {
  loadTools,
  registeredTools,
  makePerson,
  mockConnectionsList,
} from './_setup.js';

describe('google_contacts_list tool', () => {
  beforeEach(async () => {
    await loadTools();
    vi.clearAllMocks();
  });

  it('returns markdown list of contacts', async () => {
    mockConnectionsList.mockResolvedValue({
      data: { connections: [makePerson()], nextPageToken: undefined, totalItems: 1 },
    });

    const handler = registeredTools.get('google_contacts_list')!;
    const result = (await handler({ limit: 20, sort_order: 'last_modified', response_format: 'markdown' })) as {
      content: { type: string; text: string }[];
      structuredContent: { contacts: PersonEntry[]; total: number };
    };

    expect(result.content[0].text).toContain('# Contacts (1 of 1)');
    expect(result.structuredContent.contacts).toHaveLength(1);
    expect(result.structuredContent.total).toBe(1);
  });

  it('passes LAST_NAME_ASCENDING sort when sort_order is last_name', async () => {
    mockConnectionsList.mockResolvedValue({
      data: { connections: [], nextPageToken: undefined, totalItems: 0 },
    });

    const handler = registeredTools.get('google_contacts_list')!;
    await handler({ limit: 10, sort_order: 'last_name', response_format: 'json' });

    expect(mockConnectionsList).toHaveBeenCalledWith(
      expect.objectContaining({ sortOrder: 'LAST_NAME_ASCENDING' }),
    );
  });

  it('passes LAST_MODIFIED_DESCENDING sort by default', async () => {
    mockConnectionsList.mockResolvedValue({
      data: { connections: [], nextPageToken: undefined, totalItems: 0 },
    });

    const handler = registeredTools.get('google_contacts_list')!;
    await handler({ limit: 10, sort_order: 'last_modified', response_format: 'json' });

    expect(mockConnectionsList).toHaveBeenCalledWith(
      expect.objectContaining({ sortOrder: 'LAST_MODIFIED_DESCENDING' }),
    );
  });

  it('returns empty-state markdown', async () => {
    mockConnectionsList.mockResolvedValue({
      data: { connections: [], nextPageToken: undefined, totalItems: 0 },
    });

    const handler = registeredTools.get('google_contacts_list')!;
    const result = (await handler({ limit: 20, sort_order: 'last_modified', response_format: 'markdown' })) as {
      content: { type: string; text: string }[];
    };

    expect(result.content[0].text).toBe('No contacts found.');
  });

  it('returns JSON format with total count', async () => {
    mockConnectionsList.mockResolvedValue({
      data: { connections: [makePerson()], nextPageToken: 'pg2', totalItems: 50 },
    });

    const handler = registeredTools.get('google_contacts_list')!;
    const result = (await handler({ limit: 20, sort_order: 'last_modified', response_format: 'json' })) as {
      content: { type: string; text: string }[];
      structuredContent: { total: number; has_more: boolean };
    };

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.total).toBe(50);
    expect(parsed.has_more).toBe(true);
    expect(result.structuredContent.total).toBe(50);
  });
});
