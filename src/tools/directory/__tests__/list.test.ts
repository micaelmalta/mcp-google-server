import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PersonEntry } from '../index.js';

vi.mock('../../../auth/oauth.js', () => ({ requireAuth: () => ({}) }));

import './_setup.js';
import {
  loadTools,
  registeredTools,
  makePerson,
  mockListDirectoryPeople,
} from './_setup.js';

describe('google_directory_list tool', () => {
  beforeEach(async () => {
    await loadTools();
    vi.clearAllMocks();
  });

  it('returns markdown list of directory people', async () => {
    mockListDirectoryPeople.mockResolvedValue({
      data: { people: [makePerson(), makePerson({ names: [{ displayName: 'User Two' }] })], nextPageToken: undefined },
    });

    const handler = registeredTools.get('google_directory_list')!;
    const result = (await handler({ limit: 20, response_format: 'markdown' })) as {
      content: { type: string; text: string }[];
      structuredContent: { people: PersonEntry[] };
    };

    expect(result.content[0].text).toContain('# Directory (2 people)');
    expect(result.content[0].text).toContain('### Test User');
    expect(result.content[0].text).toContain('### User Two');
    expect(result.structuredContent.people).toHaveLength(2);
  });

  it('returns empty-state markdown', async () => {
    mockListDirectoryPeople.mockResolvedValue({
      data: { people: [], nextPageToken: undefined },
    });

    const handler = registeredTools.get('google_directory_list')!;
    const result = (await handler({ limit: 20, response_format: 'markdown' })) as {
      content: { type: string; text: string }[];
    };

    expect(result.content[0].text).toBe('No people found in directory.');
  });

  it('returns JSON when response_format is json', async () => {
    mockListDirectoryPeople.mockResolvedValue({
      data: {
        people: [makePerson({ names: [{ displayName: 'Alice' }] })],
        nextPageToken: 'next',
      },
    });

    const handler = registeredTools.get('google_directory_list')!;
    const result = (await handler({ limit: 10, response_format: 'json' })) as {
      content: { type: string; text: string }[];
    };

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.people).toHaveLength(1);
    expect(parsed.next_page_token).toBe('next');
    expect(parsed.has_more).toBe(true);
  });

  it('returns error on API failure', async () => {
    mockListDirectoryPeople.mockRejectedValue(new Error('forbidden'));

    const handler = registeredTools.get('google_directory_list')!;
    const result = (await handler({ limit: 20, response_format: 'markdown' })) as {
      isError: boolean;
      content: { type: string; text: string }[];
    };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Insufficient permissions');
  });
});
