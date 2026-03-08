import { describe, it, expect, vi, beforeEach } from 'vitest';
import './_setup.js';
import { loadGmailTools, registeredTools, mockDraftsCreate, mockMessagesGet, mockUsersGetProfile } from './_setup.js';

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

  it('returns error when neither to nor reply_to_message_id provided', async () => {
    const handler = registeredTools.get('google_gmail_create_draft')!;
    const result = (await handler({ subject: 'S', body: 'B' })) as { isError: boolean; content: { text: string }[] };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("'to' or 'reply_to_message_id'");
  });

  it('returns error when subject missing and no reply_to_message_id', async () => {
    const handler = registeredTools.get('google_gmail_create_draft')!;
    const result = (await handler({ to: 'a@b.com', body: 'B' })) as { isError: boolean; content: { text: string }[] };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("'subject' or 'reply_to_message_id'");
  });

  it('creates a reply-all draft with auto-populated recipients and Re: subject', async () => {
    mockMessagesGet.mockResolvedValue({
      data: {
        threadId: 'thread-42',
        payload: {
          headers: [
            { name: 'From', value: 'sender@example.com' },
            { name: 'To', value: 'me@example.com, other@example.com' },
            { name: 'Cc', value: 'cc@example.com, me@example.com' },
            { name: 'Subject', value: 'Original subject' },
            { name: 'Message-ID', value: '<orig-id@mail.example.com>' },
            { name: 'References', value: '<prev@mail.example.com>' },
          ],
        },
      },
    });
    mockUsersGetProfile.mockResolvedValue({ data: { emailAddress: 'me@example.com' } });
    mockDraftsCreate.mockResolvedValue({
      data: { id: 'draft-reply', message: { id: 'msg-reply' } },
    });

    const handler = registeredTools.get('google_gmail_create_draft')!;
    const result = (await handler({ reply_to_message_id: 'orig-msg-id', body: 'Reply body' })) as {
      content: { text: string }[];
      structuredContent: { draft_id: string };
    };

    // Verify draft created with threadId
    expect(mockDraftsCreate).toHaveBeenCalledWith({
      userId: 'me',
      requestBody: expect.objectContaining({
        message: expect.objectContaining({ raw: expect.any(String), threadId: 'thread-42' }),
      }),
    });

    // Decode raw to check headers
    const callArgs = mockDraftsCreate.mock.calls[0][0];
    const raw: string = callArgs.requestBody.message.raw;
    const decoded = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();

    // To should contain sender and other@, but NOT me@
    expect(decoded).toContain('sender@example.com');
    expect(decoded).toContain('other@example.com');
    expect(decoded).not.toContain('me@example.com');

    // CC should contain cc@ but NOT me@
    expect(decoded).toContain('Cc: cc@example.com');

    // Subject prefixed with Re:
    expect(decoded).toContain('Subject: Re: Original subject');

    expect(result.structuredContent.draft_id).toBe('draft-reply');
  });

  it('does not double-prefix subject when original starts with RE: (Outlook style)', async () => {
    mockMessagesGet.mockResolvedValue({
      data: {
        threadId: 'thread-3',
        payload: {
          headers: [
            { name: 'From', value: 'sender@example.com' },
            { name: 'To', value: 'other@example.com' },
            { name: 'Subject', value: 'RE: Important meeting' },
            { name: 'Message-ID', value: '<id@mail.example.com>' },
          ],
        },
      },
    });
    mockUsersGetProfile.mockResolvedValue({ data: { emailAddress: 'me@example.com' } });
    mockDraftsCreate.mockResolvedValue({ data: { id: 'draft-1', message: { id: 'msg-1' } } });

    const handler = registeredTools.get('google_gmail_create_draft')!;
    await handler({ reply_to_message_id: 'orig-id', body: 'body' });

    const callArgs = mockDraftsCreate.mock.calls[0][0];
    const decoded = Buffer.from(
      (callArgs.requestBody.message.raw as string).replace(/-/g, '+').replace(/_/g, '/'), 'base64'
    ).toString();

    expect(decoded).not.toMatch(/Subject:.*Re:.*RE:/);
    expect(decoded).toContain('Subject: RE: Important meeting');
  });

  it('does not exclude recipients whose display name contains user email as substring', async () => {
    mockMessagesGet.mockResolvedValue({
      data: {
        threadId: 'thread-10',
        payload: {
          headers: [
            { name: 'From', value: '"Me Helper (me@example.com)" <helper@other.com>' },
            { name: 'To', value: 'recipient@other.com' },
            { name: 'Subject', value: 'Hello' },
            { name: 'Message-ID', value: '<id@mail.example.com>' },
          ],
        },
      },
    });
    mockUsersGetProfile.mockResolvedValue({ data: { emailAddress: 'me@example.com' } });
    mockDraftsCreate.mockResolvedValue({ data: { id: 'draft-1', message: { id: 'msg-1' } } });

    const handler = registeredTools.get('google_gmail_create_draft')!;
    await handler({ reply_to_message_id: 'orig-id', body: 'body' });

    const callArgs = mockDraftsCreate.mock.calls[0][0];
    const decoded = Buffer.from(
      (callArgs.requestBody.message.raw as string).replace(/-/g, '+').replace(/_/g, '/'), 'base64'
    ).toString();

    // helper@other.com display name mentions me@example.com but actual address differs — must NOT be excluded
    expect(decoded).toContain('helper@other.com');
    expect(decoded).toContain('recipient@other.com');
  });

  it('explicit to/cc overrides reply-all defaults', async () => {
    mockMessagesGet.mockResolvedValue({
      data: {
        threadId: 'thread-7',
        payload: {
          headers: [
            { name: 'From', value: 'sender@example.com' },
            { name: 'To', value: 'other@example.com' },
            { name: 'Subject', value: 'Hello' },
            { name: 'Message-ID', value: '<id@mail.example.com>' },
          ],
        },
      },
    });
    mockUsersGetProfile.mockResolvedValue({ data: { emailAddress: 'me@example.com' } });
    mockDraftsCreate.mockResolvedValue({
      data: { id: 'draft-explicit', message: { id: 'msg-explicit' } },
    });

    const handler = registeredTools.get('google_gmail_create_draft')!;
    await handler({
      reply_to_message_id: 'orig-id',
      to: 'override@example.com',
      cc: 'overridecc@example.com',
      body: 'body',
    });

    const callArgs = mockDraftsCreate.mock.calls[0][0];
    const raw: string = callArgs.requestBody.message.raw;
    const decoded = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();

    expect(decoded).toContain('To: override@example.com');
    expect(decoded).toContain('Cc: overridecc@example.com');
    // auto-computed values not used
    expect(decoded).not.toContain('sender@example.com');
  });
});
