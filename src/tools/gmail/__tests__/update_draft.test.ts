import { describe, it, expect, vi, beforeEach } from 'vitest';
import './_setup.js';
import { loadGmailTools, registeredTools, mockDraftsUpdate, mockDraftsGet } from './_setup.js';

describe('google_gmail_update_draft tool', () => {
  beforeEach(async () => {
    await loadGmailTools();
    vi.clearAllMocks();
  });

  it('updates a draft and returns draft_id and message_id', async () => {
    mockDraftsGet.mockResolvedValue({
      data: { id: 'draft-1', message: { id: 'msg-1', threadId: null, payload: { headers: [] } } },
    });
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
    mockDraftsGet.mockResolvedValue({
      data: { id: 'draft-1', message: { id: 'msg-1', threadId: null, payload: { headers: [] } } },
    });
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
    mockDraftsGet.mockResolvedValue({
      data: { id: 'x', message: { id: 'msg-x', threadId: null, payload: { headers: [] } } },
    });
    mockDraftsUpdate.mockRejectedValue(new Error('Not found'));
    const handler = registeredTools.get('google_gmail_update_draft')!;
    const result = (await handler({ draft_id: 'x', to: 'a@b.com', subject: 'S', body: 'B' })) as { isError: boolean };
    expect(result.isError).toBe(true);
  });

  it('defaults to existing to/subject/cc/body when not provided', async () => {
    const existingBody = Buffer.from('Existing body text').toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
    mockDraftsGet.mockResolvedValue({
      data: {
        id: 'draft-1',
        message: {
          id: 'msg-1',
          threadId: null,
          payload: {
            headers: [
              { name: 'To', value: 'existing@example.com' },
              { name: 'Subject', value: 'Existing Subject' },
              { name: 'Cc', value: 'cc@example.com' },
            ],
            mimeType: 'text/plain',
            body: { data: existingBody },
          },
        },
      },
    });
    mockDraftsUpdate.mockResolvedValue({
      data: { id: 'draft-1', message: { id: 'msg-2' } },
    });

    const handler = registeredTools.get('google_gmail_update_draft')!;
    await handler({ draft_id: 'draft-1', body: 'Updated body only' });

    const callArgs = mockDraftsUpdate.mock.calls[0][0];
    const decoded = Buffer.from(
      (callArgs.requestBody.message.raw as string).replace(/-/g, '+').replace(/_/g, '/'), 'base64'
    ).toString();

    expect(decoded).toContain('existing@example.com');
    expect(decoded).toContain('Existing Subject');
    expect(decoded).toContain('cc@example.com');
    expect(decoded).toContain('Updated body only');
  });

  it('explicit fields override existing draft values', async () => {
    mockDraftsGet.mockResolvedValue({
      data: {
        id: 'draft-1',
        message: {
          id: 'msg-1',
          threadId: null,
          payload: {
            headers: [
              { name: 'To', value: 'old@example.com' },
              { name: 'Subject', value: 'Old Subject' },
            ],
          },
        },
      },
    });
    mockDraftsUpdate.mockResolvedValue({
      data: { id: 'draft-1', message: { id: 'msg-2' } },
    });

    const handler = registeredTools.get('google_gmail_update_draft')!;
    await handler({ draft_id: 'draft-1', to: 'new@example.com', subject: 'New Subject', body: 'New body' });

    const callArgs = mockDraftsUpdate.mock.calls[0][0];
    const decoded = Buffer.from(
      (callArgs.requestBody.message.raw as string).replace(/-/g, '+').replace(/_/g, '/'), 'base64'
    ).toString();

    expect(decoded).toContain('new@example.com');
    expect(decoded).toContain('New Subject');
    expect(decoded).not.toContain('old@example.com');
  });

  it('preserves In-Reply-To, References, and threadId when updating a reply draft', async () => {
    mockDraftsGet.mockResolvedValue({
      data: {
        id: 'draft-1',
        message: {
          id: 'msg-1',
          threadId: 'thread-42',
          payload: {
            headers: [
              { name: 'In-Reply-To', value: '<orig-id@mail.example.com>' },
              { name: 'References', value: '<prev@mail.example.com> <orig-id@mail.example.com>' },
            ],
          },
        },
      },
    });
    mockDraftsUpdate.mockResolvedValue({
      data: { id: 'draft-1', message: { id: 'msg-2' } },
    });

    const handler = registeredTools.get('google_gmail_update_draft')!;
    await handler({ draft_id: 'draft-1', to: 'new@b.com', subject: 'Updated Subject', body: 'Updated body' });

    const callArgs = mockDraftsUpdate.mock.calls[0][0];
    const raw: string = callArgs.requestBody.message.raw;
    const decoded = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();

    expect(decoded).toContain('In-Reply-To: <orig-id@mail.example.com>');
    expect(decoded).toContain('References:');
    expect(callArgs.requestBody.message.threadId).toBe('thread-42');
  });
});
