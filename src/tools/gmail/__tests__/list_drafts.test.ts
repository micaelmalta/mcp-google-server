import { describe, it, expect, vi, beforeEach } from 'vitest';
import './_setup.js';
import { loadGmailTools, registeredTools, mockDraftsList, mockDraftsGet } from './_setup.js';

describe('google_gmail_list_drafts tool', () => {
  beforeEach(async () => {
    await loadGmailTools();
    vi.clearAllMocks();
  });

  it('returns empty state when no drafts exist', async () => {
    mockDraftsList.mockResolvedValue({ data: { drafts: [] } });
    const handler = registeredTools.get('google_gmail_list_drafts')!;
    const result = (await handler({})) as { content: { text: string }[]; structuredContent: { items: unknown[] } };
    expect(result.content[0].text).toContain('No drafts found');
    expect(result.structuredContent.items).toHaveLength(0);
  });

  it('lists drafts with subject and recipient', async () => {
    mockDraftsList.mockResolvedValue({
      data: { drafts: [{ id: 'draft-1', message: { id: 'msg-1' } }] },
    });
    mockDraftsGet.mockResolvedValue({
      data: {
        id: 'draft-1',
        message: {
          id: 'msg-1',
          threadId: 'thread-1',
          payload: {
            headers: [
              { name: 'Subject', value: 'Hello' },
              { name: 'To', value: 'a@b.com' },
              { name: 'Date', value: 'Mon, 1 Jan 2026' },
            ],
          },
        },
      },
    });
    const handler = registeredTools.get('google_gmail_list_drafts')!;
    const result = (await handler({})) as { structuredContent: { items: { draft_id: string; subject: string }[]; total_returned: number } };
    expect(result.structuredContent.items).toHaveLength(1);
    expect(result.structuredContent.items[0].draft_id).toBe('draft-1');
    expect(result.structuredContent.items[0].subject).toBe('Hello');
    expect(result.structuredContent.total_returned).toBe(1);
  });

  it('returns error on API failure', async () => {
    mockDraftsList.mockRejectedValue(new Error('Auth failed'));
    const handler = registeredTools.get('google_gmail_list_drafts')!;
    const result = (await handler({})) as { isError: boolean };
    expect(result.isError).toBe(true);
  });
});
