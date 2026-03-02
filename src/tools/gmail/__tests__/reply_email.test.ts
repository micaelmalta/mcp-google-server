import { describe, it, expect, vi, beforeEach } from 'vitest';
import './_setup.js';
import { loadGmailTools, registeredTools, mockMessagesGet, mockMessagesSend } from './_setup.js';

describe('google_gmail_reply_email tool', () => {
  beforeEach(async () => {
    await loadGmailTools();
    vi.clearAllMocks();
  });

  it('gets original message and sends reply with threadId', async () => {
    mockMessagesGet.mockResolvedValue({
      data: {
        id: 'msg1',
        threadId: 'thread-1',
        payload: {
          headers: [
            { name: 'From', value: 'sender@example.com' },
            { name: 'Subject', value: 'Original' },
            { name: 'Message-ID', value: '<orig@mail.gmail.com>' },
            { name: 'References', value: '<ref@mail.gmail.com>' },
          ],
        },
      },
    });
    mockMessagesSend.mockResolvedValue({
      data: { id: 'reply-1', threadId: 'thread-1' },
    });

    const handler = registeredTools.get('google_gmail_reply_email')!;
    const result = (await handler({
      message_id: 'msg1',
      body: 'My reply',
    })) as {
      content: { type: string; text: string }[];
      structuredContent: { message_id: string; thread_id: string };
    };

    expect(mockMessagesGet).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'msg1', format: 'metadata' })
    );
    expect(mockMessagesSend).toHaveBeenCalledWith({
      userId: 'me',
      requestBody: expect.objectContaining({ raw: expect.any(String), threadId: 'thread-1' }),
    });
    expect(result.content[0].text).toContain('Reply sent');
    expect(result.structuredContent.message_id).toBe('reply-1');
  });

  it('returns error on API failure', async () => {
    mockMessagesGet.mockRejectedValue(new Error('Message not found 404'));

    const handler = registeredTools.get('google_gmail_reply_email')!;
    const result = (await handler({ message_id: 'bad', body: 'Hi' })) as { isError: boolean };

    expect(result.isError).toBe(true);
  });
});
