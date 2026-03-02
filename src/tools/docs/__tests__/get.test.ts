import { describe, it, expect, vi, beforeEach } from 'vitest';
import './_setup.js';
import { loadDocsTools, registeredTools, mockDocumentsGet } from './_setup.js';

describe('google_docs_get tool', () => {
  beforeEach(async () => {
    await loadDocsTools();
    vi.clearAllMocks();
  });

  it('returns document title and body content in markdown', async () => {
    mockDocumentsGet.mockResolvedValue({
      data: {
        documentId: 'doc-1',
        title: 'My Doc',
        body: {
          content: [
            {
              paragraph: {
                elements: [{ textRun: { content: 'Hello world\n' } }],
              },
            },
          ],
        },
        tabs: [],
      },
    });

    const handler = registeredTools.get('google_docs_get')!;
    const result = (await handler({ document_id: 'doc-1', response_format: 'markdown' })) as {
      content: { type: string; text: string }[];
      structuredContent: { document_id: string; title: string };
    };

    expect(result.content[0].text).toContain('# My Doc');
    expect(result.content[0].text).toContain('Hello world');
    expect(result.structuredContent.document_id).toBe('doc-1');
    expect(result.structuredContent.title).toBe('My Doc');
  });

  it('returns tab not found error when tab filter does not match', async () => {
    mockDocumentsGet.mockResolvedValue({
      data: {
        documentId: 'doc-1',
        title: 'Doc',
        body: { content: [] },
        tabs: [
          {
            tabProperties: { tabId: 't.1', title: 'Overview', index: 0 },
            documentTab: { body: { content: [] } },
          },
        ],
      },
    });

    const handler = registeredTools.get('google_docs_get')!;
    const result = (await handler({ document_id: 'doc-1', tab: 'Nonexistent', response_format: 'markdown' })) as {
      isError: boolean;
      content: { type: string; text: string }[];
    };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Tab "Nonexistent" not found');
    expect(result.content[0].text).toContain('Overview');
  });

  it('returns single tab content with title suffix when tab filter matches', async () => {
    mockDocumentsGet.mockResolvedValue({
      data: {
        documentId: 'doc-1',
        title: 'Report',
        body: { content: [] },
        tabs: [
          {
            tabProperties: { tabId: 't.1', title: 'Summary', index: 0 },
            documentTab: {
              body: {
                content: [
                  {
                    paragraph: {
                      elements: [{ textRun: { content: 'Summary content\n' } }],
                    },
                  },
                ],
              },
            },
          },
          {
            tabProperties: { tabId: 't.2', title: 'Details', index: 1 },
            documentTab: { body: { content: [] } },
          },
        ],
      },
    });

    const handler = registeredTools.get('google_docs_get')!;
    const result = (await handler({
      document_id: 'doc-1',
      tab: 'Summary',
      response_format: 'markdown',
    })) as { content: { type: string; text: string }[] };

    expect(result.content[0].text).toContain('# Report > Summary');
    expect(result.content[0].text).toContain('Summary content');
  });

  it('matches tab by tab_id when tab filter is tab ID', async () => {
    mockDocumentsGet.mockResolvedValue({
      data: {
        documentId: 'doc-1',
        title: 'Doc',
        body: { content: [] },
        tabs: [
          {
            tabProperties: { tabId: 'tab-abc', title: 'First', index: 0 },
            documentTab: { body: { content: [{ paragraph: { elements: [{ textRun: { content: 'First tab\n' } }] } }] } },
          },
        ],
      },
    });

    const handler = registeredTools.get('google_docs_get')!;
    const result = (await handler({
      document_id: 'doc-1',
      tab: 'tab-abc',
      response_format: 'markdown',
    })) as { content: { type: string; text: string }[] };

    expect(result.content[0].text).toContain('First tab');
  });

  it('returns JSON when response_format is json', async () => {
    mockDocumentsGet.mockResolvedValue({
      data: {
        documentId: 'doc-json',
        title: 'JSON Doc',
        revisionId: 'rev1',
        body: { content: [] },
        tabs: [],
      },
    });

    const handler = registeredTools.get('google_docs_get')!;
    const result = (await handler({ document_id: 'doc-json', response_format: 'json' })) as {
      content: { type: string; text: string }[];
    };

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.document_id).toBe('doc-json');
    expect(parsed.title).toBe('JSON Doc');
    expect(parsed.revision_id).toBe('rev1');
  });

  it('returns error on API failure', async () => {
    mockDocumentsGet.mockRejectedValue(new Error('Document not found 404'));

    const handler = registeredTools.get('google_docs_get')!;
    const result = (await handler({ document_id: 'bad-id', response_format: 'markdown' })) as {
      isError: boolean;
      content: { type: string; text: string }[];
    };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not found');
  });
});
