import { describe, it, expect, vi, beforeEach } from 'vitest';
import './_setup.js';
import { loadGmailTools, registeredTools, mockMessagesSend } from './_setup.js';

describe('google_gmail_send_email tool', () => {
  beforeEach(async () => {
    await loadGmailTools();
    vi.clearAllMocks();
  });

  it('sends email and returns message_id and thread_id', async () => {
    mockMessagesSend.mockResolvedValue({
      data: { id: 'msg-sent-1', threadId: 'thread-1' },
    });

    const handler = registeredTools.get('google_gmail_send_email')!;
    const result = (await handler({
      to: 'recipient@example.com',
      subject: 'Test Subject',
      body: 'Hello world',
    })) as {
      content: { type: string; text: string }[];
      structuredContent: { message_id: string; thread_id: string };
    };

    expect(mockMessagesSend).toHaveBeenCalledWith({
      userId: 'me',
      requestBody: expect.objectContaining({ raw: expect.any(String) }),
    });
    expect(result.content[0].text).toContain('Email sent successfully');
    expect(result.content[0].text).toContain('recipient@example.com');
    expect(result.structuredContent.message_id).toBe('msg-sent-1');
    expect(result.structuredContent.thread_id).toBe('thread-1');
  });

  it('returns error on API failure', async () => {
    mockMessagesSend.mockRejectedValue(new Error('Invalid recipient'));

    const handler = registeredTools.get('google_gmail_send_email')!;
    const result = (await handler({
      to: 'bad',
      subject: 'S',
      body: 'B',
    })) as { isError: boolean };

    expect(result.isError).toBe(true);
  });
});
