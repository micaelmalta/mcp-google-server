import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PersonEntry } from '../index.js';

vi.mock('../../../auth/oauth.js', () => ({ requireAuth: () => ({}) }));

import './_setup.js';
import {
  loadTools,
  registeredTools,
  makePerson,
  mockSearchDirectoryPeople,
} from './_setup.js';

describe('google_directory_search tool', () => {
  beforeEach(async () => {
    await loadTools();
    vi.clearAllMocks();
  });

  it('returns markdown for matched people', async () => {
    mockSearchDirectoryPeople.mockResolvedValue({
      data: { people: [makePerson()], nextPageToken: undefined },
    });

    const handler = registeredTools.get('google_directory_search')!;
    const result = (await handler({ query: 'Test', limit: 20, response_format: 'markdown' })) as {
      content: { type: string; text: string }[];
      structuredContent: { people: PersonEntry[] };
    };

    expect(result.content[0].text).toContain('# Directory Search: "Test"');
    expect(result.content[0].text).toContain('### Test User');
    expect(result.structuredContent.people).toHaveLength(1);
    expect(result.structuredContent.people[0].name).toBe('Test User');
  });

  it('returns no-results markdown when empty', async () => {
    mockSearchDirectoryPeople.mockResolvedValue({
      data: { people: [], nextPageToken: undefined },
    });

    const handler = registeredTools.get('google_directory_search')!;
    const result = (await handler({ query: 'Nobody', limit: 20, response_format: 'markdown' })) as {
      content: { type: string; text: string }[];
    };

    expect(result.content[0].text).toContain('No directory results for "Nobody"');
  });

  it('returns JSON when response_format is json', async () => {
    mockSearchDirectoryPeople.mockResolvedValue({
      data: { people: [makePerson()], nextPageToken: 'abc' },
    });

    const handler = registeredTools.get('google_directory_search')!;
    const result = (await handler({ query: 'Test', limit: 20, response_format: 'json' })) as {
      content: { type: string; text: string }[];
      structuredContent: { next_page_token: string; has_more: boolean };
    };

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.people).toHaveLength(1);
    expect(parsed.next_page_token).toBe('abc');
    expect(parsed.has_more).toBe(true);
    expect(result.structuredContent.next_page_token).toBe('abc');
    expect(result.structuredContent.has_more).toBe(true);
  });

  it('includes page_token hint when more results exist', async () => {
    mockSearchDirectoryPeople.mockResolvedValue({
      data: { people: [makePerson()], nextPageToken: 'next123' },
    });

    const handler = registeredTools.get('google_directory_search')!;
    const result = (await handler({ query: 'Test', limit: 20, response_format: 'markdown' })) as {
      content: { type: string; text: string }[];
    };

    expect(result.content[0].text).toContain('page_token="next123"');
  });

  it('returns error on API failure', async () => {
    mockSearchDirectoryPeople.mockRejectedValue(new Error('API quota exceeded'));

    const handler = registeredTools.get('google_directory_search')!;
    const result = (await handler({ query: 'Test', limit: 20, response_format: 'markdown' })) as {
      isError: boolean;
      content: { type: string; text: string }[];
    };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('quota');
  });
});
