import { describe, it, expect, vi, beforeEach } from 'vitest';
import './_setup.js';
import { loadGmailTools, registeredTools, mockDraftsGet, mockExecSync } from './_setup.js';

describe('google_gmail_open_draft tool', () => {
  beforeEach(async () => {
    await loadGmailTools();
    vi.clearAllMocks();
  });

  it('opens draft in Chrome and returns the URL', async () => {
    mockDraftsGet.mockResolvedValue({
      data: { id: 'draft-1', message: { id: 'msg-abc', threadId: 'thread-1' } },
    });
    mockExecSync.mockReturnValue(undefined);

    const handler = registeredTools.get('google_gmail_open_draft')!;
    const result = (await handler({ draft_id: 'draft-1' })) as {
      content: { text: string }[];
      structuredContent: { draft_id: string; message_id: string; url: string };
    };

    expect(mockDraftsGet).toHaveBeenCalledWith({ userId: 'me', id: 'draft-1' });
    expect(mockExecSync).toHaveBeenCalledWith(
      'open -a "Google Chrome" "https://mail.google.com/mail/u/0/#drafts/msg-abc"'
    );
    expect(result.content[0].text).toContain('Opened draft in Chrome');
    expect(result.structuredContent.url).toBe('https://mail.google.com/mail/u/0/#drafts/msg-abc');
    expect(result.structuredContent.message_id).toBe('msg-abc');
  });

  it('returns error on API failure', async () => {
    mockDraftsGet.mockRejectedValue(new Error('Not found'));
    const handler = registeredTools.get('google_gmail_open_draft')!;
    const result = (await handler({ draft_id: 'bad' })) as { isError: boolean };
    expect(result.isError).toBe(true);
  });
});
