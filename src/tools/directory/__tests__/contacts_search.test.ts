import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PersonEntry } from '../index.js';

vi.mock('../../../auth/oauth.js', () => ({ requireAuth: () => ({}) }));

import './_setup.js';
import {
  loadTools,
  registeredTools,
  makePerson,
  mockSearchContacts,
} from './_setup.js';

describe('google_contacts_search tool', () => {
  beforeEach(async () => {
    await loadTools();
    vi.clearAllMocks();
  });

  it('returns markdown for matched contacts', async () => {
    mockSearchContacts.mockResolvedValue({
      data: { results: [{ person: makePerson() }] },
    });

    const handler = registeredTools.get('google_contacts_search')!;
    const result = (await handler({ query: 'Test', limit: 10, response_format: 'markdown' })) as {
      content: { type: string; text: string }[];
      structuredContent: { contacts: PersonEntry[] };
    };

    expect(result.content[0].text).toContain('# Contact Search: "Test"');
    expect(result.content[0].text).toContain('### Test User');
    expect(result.structuredContent.contacts).toHaveLength(1);
  });

  it('filters out null person entries from results', async () => {
    mockSearchContacts.mockResolvedValue({
      data: { results: [{ person: makePerson() }, { person: null }, {}] },
    });

    const handler = registeredTools.get('google_contacts_search')!;
    const result = (await handler({ query: 'Test', limit: 10, response_format: 'json' })) as {
      structuredContent: { contacts: PersonEntry[] };
    };

    expect(result.structuredContent.contacts).toHaveLength(1);
  });

  it('returns no-results markdown when empty', async () => {
    mockSearchContacts.mockResolvedValue({
      data: { results: [] },
    });

    const handler = registeredTools.get('google_contacts_search')!;
    const result = (await handler({ query: 'Nobody', limit: 10, response_format: 'markdown' })) as {
      content: { type: string; text: string }[];
    };

    expect(result.content[0].text).toContain('No contacts found matching "Nobody"');
  });

  it('returns error on API failure', async () => {
    mockSearchContacts.mockRejectedValue(new Error('not found 404'));

    const handler = registeredTools.get('google_contacts_search')!;
    const result = (await handler({ query: 'Test', limit: 10, response_format: 'markdown' })) as {
      isError: boolean;
      content: { type: string; text: string }[];
    };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not found');
  });
});
