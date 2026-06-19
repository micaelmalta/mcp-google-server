import { describe, it, expect, vi, beforeEach } from 'vitest';
import './_setup.js';
import { loadDocsTools, registeredTools, mockDocumentsCreate, mockDocumentsBatchUpdate, mockFilesCreate } from './_setup.js';

describe('google_docs_create tool', () => {
  beforeEach(async () => {
    await loadDocsTools();
    vi.clearAllMocks();
  });

  it('creates doc and returns document_id and link', async () => {
    mockDocumentsCreate.mockResolvedValue({
      data: { documentId: 'doc-new-1' },
    });
    mockDocumentsBatchUpdate.mockResolvedValue({});

    const handler = registeredTools.get('google_docs_create')!;
    const result = (await handler({ title: 'My New Doc' })) as {
      content: { type: string; text: string }[];
      structuredContent: { document_id: string; web_view_link: string };
    };

    expect(mockDocumentsCreate).toHaveBeenCalledWith({
      requestBody: { title: 'My New Doc' },
    });
    expect(result.structuredContent.document_id).toBe('doc-new-1');
    expect(result.structuredContent.web_view_link).toContain('doc-new-1');
  });

  it('creates doc with initial content and calls batchUpdate', async () => {
    mockDocumentsCreate.mockResolvedValue({ data: { documentId: 'doc-2' } });
    mockDocumentsBatchUpdate.mockResolvedValue({});

    const handler = registeredTools.get('google_docs_create')!;
    await handler({ title: 'With Content', content: 'Hello world' });

    expect(mockDocumentsBatchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 'doc-2',
        requestBody: { requests: expect.any(Array) },
      })
    );
  });

  it('returns error on API failure', async () => {
    mockDocumentsCreate.mockRejectedValue(new Error('Invalid title'));

    const handler = registeredTools.get('google_docs_create')!;
    const result = (await handler({ title: 'Bad' })) as { isError: boolean };

    expect(result.isError).toBe(true);
  });

  it('creates a doc from markdown via Drive media upload', async () => {
    mockFilesCreate.mockResolvedValue({ data: { id: 'doc-md-1' } });
    const handler = registeredTools.get('google_docs_create')!;

    const result = await handler({ title: 'MD Doc', markdown: '# Hello\n\n**bold**' }) as {
      structuredContent: { document_id: string; web_view_link: string };
    };

    expect(mockFilesCreate).toHaveBeenCalledWith({
      requestBody: { name: 'MD Doc', mimeType: 'application/vnd.google-apps.document' },
      media: { mimeType: 'text/markdown', body: '# Hello\n\n**bold**' },
      fields: 'id',
    });
    expect(mockDocumentsCreate).not.toHaveBeenCalled();
    expect(result.structuredContent.document_id).toBe('doc-md-1');
    expect(result.structuredContent.web_view_link).toBe(
      'https://docs.google.com/document/d/doc-md-1/edit'
    );
  });

  it('rejects passing both content and markdown', async () => {
    const handler = registeredTools.get('google_docs_create')!;
    const result = await handler({ title: 'X', content: 'a', markdown: 'b' }) as {
      isError?: boolean;
      content: Array<{ text: string }>;
    };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/only one of/i);
  });
});
