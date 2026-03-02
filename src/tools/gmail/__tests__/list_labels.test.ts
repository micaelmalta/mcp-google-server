import { describe, it, expect, vi, beforeEach } from 'vitest';
import './_setup.js';
import { loadGmailTools, registeredTools, mockLabelsList } from './_setup.js';

describe('google_gmail_list_labels tool', () => {
  beforeEach(async () => {
    await loadGmailTools();
    vi.clearAllMocks();
  });

  it('returns markdown with system and custom labels', async () => {
    mockLabelsList.mockResolvedValue({
      data: {
        labels: [
          { id: 'INBOX', name: 'INBOX', type: 'system', messagesTotal: 10, messagesUnread: 2 },
          { id: 'Label_1', name: 'Custom', type: 'user', messagesTotal: 5, messagesUnread: 0 },
        ],
      },
    });

    const handler = registeredTools.get('google_gmail_list_labels')!;
    const result = (await handler({ response_format: 'markdown' })) as {
      content: { type: string; text: string }[];
      structuredContent: { labels: unknown[] };
    };

    expect(result.content[0].text).toContain('# Gmail Labels');
    expect(result.content[0].text).toContain('System Labels');
    expect(result.content[0].text).toContain('INBOX');
    expect(result.content[0].text).toContain('Custom Labels');
    expect(result.content[0].text).toContain('Custom');
    expect(result.structuredContent.labels).toHaveLength(2);
  });

  it('returns JSON when response_format is json', async () => {
    mockLabelsList.mockResolvedValue({
      data: { labels: [{ id: 'SENT', name: 'SENT', type: 'system', messagesTotal: 0, messagesUnread: 0 }] },
    });

    const handler = registeredTools.get('google_gmail_list_labels')!;
    const result = (await handler({ response_format: 'json' })) as { content: { type: string; text: string }[] };

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.labels).toHaveLength(1);
    expect(parsed.labels[0].id).toBe('SENT');
  });

  it('returns error on API failure', async () => {
    mockLabelsList.mockRejectedValue(new Error('quota exceeded'));

    const handler = registeredTools.get('google_gmail_list_labels')!;
    const result = (await handler({ response_format: 'markdown' })) as {
      isError: boolean;
      content: { type: string; text: string }[];
    };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('quota');
  });
});
