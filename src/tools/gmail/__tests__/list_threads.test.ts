import { describe, it, expect, vi, beforeEach } from 'vitest';
import './_setup.js';
import { loadGmailTools, registeredTools, mockThreadsList } from './_setup.js';

describe('google_gmail_list_threads tool', () => {
  beforeEach(async () => {
    await loadGmailTools();
    vi.clearAllMocks();
  });

  it('returns threads in markdown', async () => {
    mockThreadsList.mockResolvedValue({
      data: {
        threads: [
          { id: 't1', snippet: 'Snippet one', historyId: '100' },
          { id: 't2', snippet: 'Snippet two', historyId: '101' },
        ],
        nextPageToken: undefined,
      },
    });

    const handler = registeredTools.get('google_gmail_list_threads')!;
    const result = (await handler({ limit: 20, response_format: 'markdown' })) as {
      content: { type: string; text: string }[];
      structuredContent: { threads: { id: string }[] };
    };

    expect(result.content[0].text).toContain('Gmail Threads (2)');
    expect(result.structuredContent.threads).toHaveLength(2);
    expect(result.structuredContent.threads[0].id).toBe('t1');
  });

  it('returns error on API failure', async () => {
    mockThreadsList.mockRejectedValue(new Error('Quota exceeded'));

    const handler = registeredTools.get('google_gmail_list_threads')!;
    const result = (await handler({ response_format: 'markdown' })) as { isError: boolean };

    expect(result.isError).toBe(true);
  });
});
