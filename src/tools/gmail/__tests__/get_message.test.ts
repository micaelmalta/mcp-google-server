import { describe, it, expect, vi, beforeEach } from 'vitest';
import './_setup.js';
import { loadGmailTools, registeredTools, mockMessagesGet } from './_setup.js';

describe('google_gmail_get_message tool', () => {
  beforeEach(async () => {
    await loadGmailTools();
    vi.clearAllMocks();
  });

  it('returns message content in markdown', async () => {
    mockMessagesGet.mockResolvedValue({
      data: {
        id: 'msg1',
        threadId: 't1',
        payload: {
          mimeType: 'text/plain',
          body: { data: Buffer.from('Hello world').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '') },
          headers: [
            { name: 'From', value: 'a@example.com' },
            { name: 'To', value: 'b@example.com' },
            { name: 'Subject', value: 'Hello' },
            { name: 'Date', value: 'Mon, 1 Mar 2026 10:00:00 +0000' },
          ],
          parts: [],
        },
        labelIds: ['INBOX'],
      },
    });

    const handler = registeredTools.get('google_gmail_get_message')!;
    const result = (await handler({
      message_id: 'msg1',
      response_format: 'markdown',
    })) as { content: { type: string; text: string }[]; structuredContent: { id: string; subject: string } };

    expect(result.content[0].text).toContain('Hello');
    expect(result.content[0].text).toContain('Hello world');
    expect(result.structuredContent.id).toBe('msg1');
    expect(result.structuredContent.subject).toBe('Hello');
  });

  it('returns error on API failure', async () => {
    mockMessagesGet.mockRejectedValue(new Error('Message not found 404'));

    const handler = registeredTools.get('google_gmail_get_message')!;
    const result = (await handler({ message_id: 'bad', response_format: 'markdown' })) as {
      isError: boolean;
    };

    expect(result.isError).toBe(true);
  });
});
