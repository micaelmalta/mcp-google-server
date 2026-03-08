import { describe, it, expect, vi, beforeEach } from 'vitest';
import './_setup.js';
import { loadGmailTools, registeredTools, mockDraftsUpdate } from './_setup.js';

describe('google_gmail_update_draft tool', () => {
  beforeEach(async () => {
    await loadGmailTools();
    vi.clearAllMocks();
  });

  it('updates a draft and returns draft_id and message_id', async () => {
    mockDraftsUpdate.mockResolvedValue({
      data: { id: 'draft-1', message: { id: 'msg-2', threadId: 'thread-1' } },
    });
    const handler = registeredTools.get('google_gmail_update_draft')!;
    const result = (await handler({
      draft_id: 'draft-1',
      to: 'new@b.com',
      subject: 'Updated Subject',
      body: 'Updated body',
    })) as { content: { text: string }[]; structuredContent: { draft_id: string; message_id: string } };

    expect(mockDraftsUpdate).toHaveBeenCalledWith({
      userId: 'me',
      id: 'draft-1',
      requestBody: expect.objectContaining({ message: expect.objectContaining({ raw: expect.any(String) }) }),
    });
    expect(result.content[0].text).toContain('Draft updated successfully');
    expect(result.structuredContent.draft_id).toBe('draft-1');
    expect(result.structuredContent.message_id).toBe('msg-2');
  });

  it('includes BCC when provided', async () => {
    mockDraftsUpdate.mockResolvedValue({
      data: { id: 'draft-1', message: { id: 'msg-3' } },
    });
    const handler = registeredTools.get('google_gmail_update_draft')!;
    await handler({
      draft_id: 'draft-1',
      to: 'a@b.com',
      subject: 'S',
      body: 'B',
      bcc: 'hidden@example.com',
    });
    const callArgs = mockDraftsUpdate.mock.calls[0][0];
    const raw: string = callArgs.requestBody.message.raw;
    const decoded = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
    expect(decoded).toContain('Bcc: hidden@example.com');
  });

  it('returns error on API failure', async () => {
    mockDraftsUpdate.mockRejectedValue(new Error('Not found'));
    const handler = registeredTools.get('google_gmail_update_draft')!;
    const result = (await handler({ draft_id: 'x', to: 'a@b.com', subject: 'S', body: 'B' })) as { isError: boolean };
    expect(result.isError).toBe(true);
  });
});
