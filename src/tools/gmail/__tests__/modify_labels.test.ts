import { describe, it, expect, vi, beforeEach } from 'vitest';
import './_setup.js';
import { loadGmailTools, registeredTools, mockMessagesBatchModify } from './_setup.js';

describe('google_gmail_modify_labels tool', () => {
  beforeEach(async () => {
    await loadGmailTools();
    vi.clearAllMocks();
  });

  it('returns error when neither add_labels nor remove_labels provided', async () => {
    const handler = registeredTools.get('google_gmail_modify_labels')!;
    const result = (await handler({
      message_ids: 'msg1,msg2',
    })) as { isError: boolean; content: { type: string; text: string }[] };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('add_labels or remove_labels');
    expect(mockMessagesBatchModify).not.toHaveBeenCalled();
  });

  it('calls batchModify and returns success', async () => {
    mockMessagesBatchModify.mockResolvedValue(undefined);

    const handler = registeredTools.get('google_gmail_modify_labels')!;
    const result = (await handler({
      message_ids: 'msg1',
      remove_labels: 'UNREAD',
    })) as { content: { type: string; text: string }[] };

    expect(mockMessagesBatchModify).toHaveBeenCalledWith({
      userId: 'me',
      requestBody: {
        ids: ['msg1'],
        removeLabelIds: ['UNREAD'],
        addLabelIds: undefined,
      },
    });
    expect(result.content[0].text).toContain('Labels updated');
    expect(result.content[0].text).toContain('Removed: UNREAD');
  });

  it('returns error on API failure', async () => {
    mockMessagesBatchModify.mockRejectedValue(new Error('Invalid label'));

    const handler = registeredTools.get('google_gmail_modify_labels')!;
    const result = (await handler({
      message_ids: 'msg1',
      add_labels: 'STARRED',
    })) as { isError: boolean };

    expect(result.isError).toBe(true);
  });
});
