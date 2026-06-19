import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadDocsTools,
  registeredTools,
  mockFilesUpdate,
  mockDocumentsGet,
  mockDocumentsBatchUpdate,
} from './_setup.js';

describe('google_docs_replace_content', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await loadDocsTools();
  });

  it('replaces the body with markdown via Drive media update', async () => {
    mockFilesUpdate.mockResolvedValue({ data: { id: 'doc-1' } });
    const handler = registeredTools.get('google_docs_replace_content')!;

    const result = await handler({ document_id: 'doc-1', markdown: '# New' }) as {
      structuredContent: { document_id: string; web_view_link: string };
    };

    expect(mockFilesUpdate).toHaveBeenCalledWith({
      fileId: 'doc-1',
      media: { mimeType: 'text/markdown', body: '# New' },
    });
    expect(mockDocumentsBatchUpdate).not.toHaveBeenCalled();
    expect(result.structuredContent.document_id).toBe('doc-1');
  });

  it('replaces the body with plaintext via Docs batchUpdate (delete range + insert)', async () => {
    mockDocumentsGet.mockResolvedValue({
      data: { body: { content: [{ endIndex: 1 }, { endIndex: 42 }] } },
    });
    mockDocumentsBatchUpdate.mockResolvedValue({ data: {} });
    const handler = registeredTools.get('google_docs_replace_content')!;

    await handler({ document_id: 'doc-2', content: 'plain new text' });

    expect(mockDocumentsBatchUpdate).toHaveBeenCalledWith({
      documentId: 'doc-2',
      requestBody: {
        requests: [
          { deleteContentRange: { range: { startIndex: 1, endIndex: 41 } } },
          { insertText: { location: { index: 1 }, text: 'plain new text' } },
        ],
      },
    });
    expect(mockFilesUpdate).not.toHaveBeenCalled();
  });

  it('skips the delete request when the body is already empty', async () => {
    mockDocumentsGet.mockResolvedValue({ data: { body: { content: [{ endIndex: 1 }] } } });
    mockDocumentsBatchUpdate.mockResolvedValue({ data: {} });
    const handler = registeredTools.get('google_docs_replace_content')!;

    await handler({ document_id: 'doc-3', content: 'hi' });

    expect(mockDocumentsBatchUpdate).toHaveBeenCalledWith({
      documentId: 'doc-3',
      requestBody: {
        requests: [{ insertText: { location: { index: 1 }, text: 'hi' } }],
      },
    });
  });

  it('errors when neither content nor markdown is provided', async () => {
    const handler = registeredTools.get('google_docs_replace_content')!;
    const result = await handler({ document_id: 'doc-4' }) as {
      isError?: boolean;
      content: Array<{ text: string }>;
    };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/exactly one of/i);
  });

  it('errors when both content and markdown are provided', async () => {
    const handler = registeredTools.get('google_docs_replace_content')!;
    const result = await handler({ document_id: 'doc-5', content: 'a', markdown: 'b' }) as {
      isError?: boolean;
      content: Array<{ text: string }>;
    };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/exactly one of/i);
  });
});
