import { describe, it, expect, vi, beforeEach } from 'vitest';
import './_setup.js';
import { loadDocsTools, registeredTools, mockDocumentsGet, mockDocumentsBatchUpdate } from './_setup.js';

describe('google_docs_append_text tool', () => {
  beforeEach(async () => {
    await loadDocsTools();
    vi.clearAllMocks();
  });

  it('appends text with newline when add_newline_before is true', async () => {
    mockDocumentsGet.mockResolvedValue({
      data: {
        documentId: 'doc-1',
        body: { content: [{ endIndex: 50 }] },
      },
    });
    mockDocumentsBatchUpdate.mockResolvedValue({});

    const handler = registeredTools.get('google_docs_append_text')!;
    await handler({
      document_id: 'doc-1',
      text: 'New paragraph',
      add_newline_before: true,
    });

    const call = mockDocumentsBatchUpdate.mock.calls[0];
    const insertText = (call?.[0] as { requestBody: { requests: { insertText: { text: string } }[] } })?.requestBody?.requests?.[0]?.insertText;
    expect(insertText?.text).toBe('\nNew paragraph');
  });

  it('appends text and returns success', async () => {
    mockDocumentsGet.mockResolvedValue({
      data: {
        documentId: 'doc-1',
        body: { content: [{ endIndex: 100 }] },
      },
    });
    mockDocumentsBatchUpdate.mockResolvedValue({});

    const handler = registeredTools.get('google_docs_append_text')!;
    const result = (await handler({
      document_id: 'doc-1',
      text: 'Appended line',
    })) as { content: { type: string; text: string }[] };

    expect(mockDocumentsGet).toHaveBeenCalledWith({
      documentId: 'doc-1',
    });
    expect(mockDocumentsBatchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 'doc-1',
        requestBody: {
          requests: [{ insertText: { location: { index: expect.any(Number) }, text: expect.stringContaining('Appended line') } }],
        },
      })
    );
    expect(result.content[0].text).toContain('Text appended');
  });

  it('returns error on API failure', async () => {
    mockDocumentsGet.mockRejectedValue(new Error('Document not found 404'));

    const handler = registeredTools.get('google_docs_append_text')!;
    const result = (await handler({
      document_id: 'bad',
      text: 'Hi',
    })) as { isError: boolean };

    expect(result.isError).toBe(true);
  });
});
