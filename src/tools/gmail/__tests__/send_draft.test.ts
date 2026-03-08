import { describe, it, expect, vi, beforeEach } from 'vitest';
import './_setup.js';
import { loadGmailTools, registeredTools, mockDraftsSend, mockMessagesGet } from './_setup.js';

describe('google_gmail_send_draft tool', () => {
  beforeEach(async () => {
    await loadGmailTools();
    vi.clearAllMocks();
  });

  it('sends a draft and returns delivery details', async () => {
    mockDraftsSend.mockResolvedValue({ data: { id: 'msg-sent-1', threadId: 'thread-1' } });
    mockMessagesGet.mockResolvedValue({
      data: {
        id: 'msg-sent-1',
        threadId: 'thread-1',
        payload: {
          headers: [
            { name: 'To', value: 'recipient@example.com' },
            { name: 'Subject', value: 'Test Subject' },
            { name: 'Date', value: 'Mon, 8 Mar 2026 10:00:00 +0000' },
          ],
        },
      },
    });

    const handler = registeredTools.get('google_gmail_send_draft')!;
    const result = (await handler({ draft_id: 'draft-1' })) as {
      content: { text: string }[];
      structuredContent: {
        message_id: string;
        thread_id: string;
        subject: string;
        to: string;
        cc: string | undefined;
        date: string;
      };
    };

    expect(mockDraftsSend).toHaveBeenCalledWith({
      userId: 'me',
      requestBody: { id: 'draft-1' },
    });
    expect(mockMessagesGet).toHaveBeenCalledWith({
      userId: 'me',
      id: 'msg-sent-1',
      format: 'metadata',
      metadataHeaders: ['To', 'Cc', 'Subject', 'Date'],
    });
    expect(result.structuredContent.message_id).toBe('msg-sent-1');
    expect(result.structuredContent.thread_id).toBe('thread-1');
    expect(result.structuredContent.subject).toBe('Test Subject');
    expect(result.structuredContent.to).toBe('recipient@example.com');
    expect(result.structuredContent.cc).toBeUndefined();
    expect(result.structuredContent.date).toBe('Mon, 8 Mar 2026 10:00:00 +0000');
    expect(result.content[0].text).toContain('Test Subject');
    expect(result.content[0].text).toContain('recipient@example.com');
  });

  it('includes cc in response when present', async () => {
    mockDraftsSend.mockResolvedValue({ data: { id: 'msg-2', threadId: 'thread-2' } });
    mockMessagesGet.mockResolvedValue({
      data: {
        id: 'msg-2',
        threadId: 'thread-2',
        payload: {
          headers: [
            { name: 'To', value: 'to@example.com' },
            { name: 'Cc', value: 'cc@example.com' },
            { name: 'Subject', value: 'CC Test' },
            { name: 'Date', value: 'Mon, 8 Mar 2026 11:00:00 +0000' },
          ],
        },
      },
    });

    const handler = registeredTools.get('google_gmail_send_draft')!;
    const result = (await handler({ draft_id: 'draft-2' })) as {
      structuredContent: { cc: string | undefined };
    };
    expect(result.structuredContent.cc).toBe('cc@example.com');
  });

  it('returns error on API failure', async () => {
    mockDraftsSend.mockRejectedValue(new Error('Not found 404'));
    const handler = registeredTools.get('google_gmail_send_draft')!;
    const result = (await handler({ draft_id: 'bad-id' })) as { isError: boolean };
    expect(result.isError).toBe(true);
  });
});
