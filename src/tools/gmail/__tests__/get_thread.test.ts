import { describe, it, expect, vi, beforeEach } from 'vitest';
import './_setup.js';
import { loadGmailTools, registeredTools, mockThreadsGet } from './_setup.js';

describe('google_gmail_get_thread tool', () => {
  beforeEach(async () => {
    await loadGmailTools();
    vi.clearAllMocks();
  });

  it('returns thread messages in markdown', async () => {
    mockThreadsGet.mockResolvedValue({
      data: {
        id: 'thread-1',
        messages: [
          {
            id: 'm1',
            threadId: 'thread-1',
            payload: {
              headers: [
                { name: 'From', value: 'a@example.com' },
                { name: 'To', value: 'b@example.com' },
                { name: 'Subject', value: 'First' },
                { name: 'Date', value: 'Mon, 1 Mar 2026 10:00:00 +0000' },
              ],
              mimeType: 'text/plain',
              body: { data: null },
            },
            labelIds: ['INBOX'],
          },
        ],
      },
    });

    const handler = registeredTools.get('google_gmail_get_thread')!;
    const result = (await handler({
      thread_id: 'thread-1',
      response_format: 'markdown',
    })) as {
      content: { type: string; text: string }[];
      structuredContent: { thread_id: string; messages: unknown[] };
    };

    expect(result.content[0].text).toContain('Thread (1 messages)');
    expect(result.structuredContent.thread_id).toBe('thread-1');
    expect(result.structuredContent.messages).toHaveLength(1);
  });

  it('returns error on API failure', async () => {
    mockThreadsGet.mockRejectedValue(new Error('Thread not found 404'));

    const handler = registeredTools.get('google_gmail_get_thread')!;
    const result = (await handler({
      thread_id: 'bad',
      response_format: 'markdown',
    })) as { isError: boolean };

    expect(result.isError).toBe(true);
  });
});
