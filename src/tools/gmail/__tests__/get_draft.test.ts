import { describe, it, expect, vi, beforeEach } from 'vitest';
import './_setup.js';
import { loadGmailTools, registeredTools, mockDraftsGet } from './_setup.js';

describe('google_gmail_get_draft tool', () => {
  beforeEach(async () => {
    await loadGmailTools();
    vi.clearAllMocks();
  });

  it('returns full draft content', async () => {
    mockDraftsGet.mockResolvedValue({
      data: {
        id: 'draft-1',
        message: {
          id: 'msg-1',
          threadId: 'thread-1',
          payload: {
            mimeType: 'text/plain',
            headers: [
              { name: 'Subject', value: 'Hello World' },
              { name: 'To', value: 'a@b.com' },
              { name: 'From', value: 'me@example.com' },
              { name: 'Date', value: 'Mon, 1 Jan 2026' },
            ],
            body: { data: Buffer.from('Draft body text').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '') },
          },
        },
      },
    });
    const handler = registeredTools.get('google_gmail_get_draft')!;
    const result = (await handler({ draft_id: 'draft-1' })) as {
      content: { text: string }[];
      structuredContent: { draft_id: string; subject: string; to: string; body: string };
    };
    expect(mockDraftsGet).toHaveBeenCalledWith({ userId: 'me', id: 'draft-1' });
    expect(result.content[0].text).toContain('Hello World');
    expect(result.structuredContent.draft_id).toBe('draft-1');
    expect(result.structuredContent.subject).toBe('Hello World');
    expect(result.structuredContent.to).toBe('a@b.com');
    expect(result.structuredContent.body).toContain('Draft body text');
  });

  it('returns error on API failure', async () => {
    mockDraftsGet.mockRejectedValue(new Error('Not found 404'));
    const handler = registeredTools.get('google_gmail_get_draft')!;
    const result = (await handler({ draft_id: 'bad' })) as { isError: boolean };
    expect(result.isError).toBe(true);
  });
});
