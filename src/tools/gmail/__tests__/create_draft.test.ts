import { describe, it, expect, vi, beforeEach } from 'vitest';
import './_setup.js';
import { loadGmailTools, registeredTools, mockDraftsCreate } from './_setup.js';

describe('google_gmail_create_draft tool', () => {
  beforeEach(async () => {
    await loadGmailTools();
    vi.clearAllMocks();
  });

  it('creates a draft and returns draft_id and message_id', async () => {
    mockDraftsCreate.mockResolvedValue({
      data: { id: 'draft-1', message: { id: 'msg-1', threadId: 'thread-1' } },
    });
    const handler = registeredTools.get('google_gmail_create_draft')!;
    const result = (await handler({ to: 'a@b.com', subject: 'Test', body: 'Body' })) as {
      content: { type: string; text: string }[];
      structuredContent: { draft_id: string; message_id: string };
    };
    expect(mockDraftsCreate).toHaveBeenCalledWith({
      userId: 'me',
      requestBody: expect.objectContaining({ message: expect.objectContaining({ raw: expect.any(String) }) }),
    });
    expect(result.content[0].text).toContain('Draft created successfully');
    expect(result.structuredContent.draft_id).toBe('draft-1');
    expect(result.structuredContent.message_id).toBe('msg-1');
  });

  it('returns error on API failure', async () => {
    mockDraftsCreate.mockRejectedValue(new Error('API error'));
    const handler = registeredTools.get('google_gmail_create_draft')!;
    const result = (await handler({ to: 'a@b.com', subject: 'S', body: 'B' })) as { isError: boolean };
    expect(result.isError).toBe(true);
  });
});
