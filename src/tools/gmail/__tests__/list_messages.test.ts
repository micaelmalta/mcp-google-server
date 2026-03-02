import { describe, it, expect, vi, beforeEach } from 'vitest';
import './_setup.js';
import { loadGmailTools, registeredTools, mockMessagesList, mockMessagesGet } from './_setup.js';

describe('google_gmail_list_messages tool', () => {
  beforeEach(async () => {
    await loadGmailTools();
    vi.clearAllMocks();
  });

  it('returns empty state when no messages', async () => {
    mockMessagesList.mockResolvedValue({ data: { messages: [], nextPageToken: undefined } });

    const handler = registeredTools.get('google_gmail_list_messages')!;
    const result = (await handler({ limit: 20, response_format: 'markdown' })) as {
      content: { type: string; text: string }[];
      structuredContent: { messages: unknown[]; has_more: boolean };
    };

    expect(result.content[0].text).toContain('No messages found');
    expect(result.structuredContent.messages).toHaveLength(0);
    expect(result.structuredContent.has_more).toBe(false);
  });

  it('returns messages when list returns refs and get returns full message', async () => {
    mockMessagesList.mockResolvedValue({
      data: { messages: [{ id: 'msg1', threadId: 't1' }], nextPageToken: undefined },
    });
    mockMessagesGet.mockResolvedValue({
      data: {
        id: 'msg1',
        threadId: 't1',
        snippet: 'Preview text',
        payload: {
          headers: [
            { name: 'From', value: 'sender@example.com' },
            { name: 'To', value: 'me@example.com' },
            { name: 'Subject', value: 'Test' },
            { name: 'Date', value: 'Mon, 1 Mar 2026 10:00:00 +0000' },
          ],
        },
        labelIds: ['INBOX'],
      },
    });

    const handler = registeredTools.get('google_gmail_list_messages')!;
    const result = (await handler({ limit: 10, response_format: 'markdown' })) as {
      content: { type: string; text: string }[];
      structuredContent: { messages: { id: string; subject: string }[] };
    };

    expect(result.content[0].text).toContain('Gmail Messages');
    expect(result.structuredContent.messages).toHaveLength(1);
    expect(result.structuredContent.messages[0].id).toBe('msg1');
    expect(result.structuredContent.messages[0].subject).toBe('Test');
  });

  it('returns error on API failure', async () => {
    mockMessagesList.mockRejectedValue(new Error('Quota exceeded'));

    const handler = registeredTools.get('google_gmail_list_messages')!;
    const result = (await handler({ response_format: 'markdown' })) as { isError: boolean };

    expect(result.isError).toBe(true);
  });
});
