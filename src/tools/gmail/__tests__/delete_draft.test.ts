import { describe, it, expect, vi, beforeEach } from 'vitest';
import './_setup.js';
import { loadGmailTools, registeredTools, mockDraftsDelete } from './_setup.js';

describe('google_gmail_delete_draft tool', () => {
  beforeEach(async () => {
    await loadGmailTools();
    vi.clearAllMocks();
  });

  it('deletes a draft and confirms deletion', async () => {
    mockDraftsDelete.mockResolvedValue({ data: {} });
    const handler = registeredTools.get('google_gmail_delete_draft')!;
    const result = (await handler({ draft_id: 'draft-1' })) as {
      content: { text: string }[];
      structuredContent: { draft_id: string; deleted: boolean };
    };
    expect(mockDraftsDelete).toHaveBeenCalledWith({ userId: 'me', id: 'draft-1' });
    expect(result.content[0].text).toContain('deleted successfully');
    expect(result.structuredContent.deleted).toBe(true);
    expect(result.structuredContent.draft_id).toBe('draft-1');
  });

  it('returns error on API failure', async () => {
    mockDraftsDelete.mockRejectedValue(new Error('Not found 404'));
    const handler = registeredTools.get('google_gmail_delete_draft')!;
    const result = (await handler({ draft_id: 'bad' })) as { isError: boolean };
    expect(result.isError).toBe(true);
  });
});
