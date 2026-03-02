import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getDocs, extractTabText, formatDocTabs, type TabData } from './shared.js';
import { ResponseFormat } from '../../types.js';
import { handleGoogleError } from '../../utils/errors.js';
import { truncateIfNeeded } from '../../utils/format.js';

export function registerDocsGet(server: McpServer): void {
  server.registerTool(
    'google_docs_get',
    {
      title: 'Get Google Doc Content',
      description: `Retrieves the text content of a Google Docs document, including all tabs.

Args:
  - document_id: Document ID (from google_docs_create or google_drive_search_files)
  - tab: Optional tab title or tab ID to focus on a single tab. If omitted, all tabs are returned.
  - response_format: 'markdown' or 'json'

Returns the document title and content. Top-level tabs are fetched; nested child tabs are not included.
When multiple tabs exist, each is labeled with its title. When 'tab' is specified and not found, returns an error.
For 'json' format, returns a structured tabs array with tab_id, title, index, and text_content per tab.`,
      inputSchema: z.object({
        document_id: z.string().min(1).describe('Document ID.'),
        tab: z.string().optional().describe('Tab title or tab ID to focus on. Omit to return all tabs.'),
        response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ document_id, tab, response_format }) => {
      try {
        const docs = getDocs();
        const res = await docs.documents.get({
          documentId: document_id,
          includeTabsContent: true,
        });
        const doc = res.data;

        const rawTabs = doc.tabs ?? [];
        const tabsData: TabData[] = rawTabs.length > 0
          ? rawTabs.map((t, i) => ({
              tab_id: t.tabProperties?.tabId ?? `tab_${i}`,
              title: t.tabProperties?.title ?? `Tab ${i + 1}`,
              index: t.tabProperties?.index ?? i,
              text_content: extractTabText(t),
            }))
          : [
              {
                tab_id: 'tab_0',
                title: 'Main',
                index: 0,
                text_content: extractTabText({ documentTab: { body: doc.body ?? null } }),
              },
            ];

        const effectiveTabs = tab
          ? (() => {
              const match = tabsData.find(
                (t) => t.title.toLowerCase() === tab.toLowerCase() || t.tab_id === tab
              );
              return match ? [match] : [];
            })()
          : tabsData;

        if (tab && effectiveTabs.length === 0) {
          const available = tabsData.map((t) => `${t.title} (${t.tab_id})`).join(', ');
          return {
            isError: true,
            content: [{ type: 'text', text: `Tab "${tab}" not found. Available tabs: ${available}` }],
          };
        }

        const formattedContent = formatDocTabs(effectiveTabs);

        let text: string;
        if (response_format === ResponseFormat.MARKDOWN) {
          const titleSuffix = effectiveTabs.length === 1 && tab ? effectiveTabs[0].title : undefined;
          const heading = titleSuffix
            ? `# ${doc.title ?? 'Untitled'} > ${titleSuffix}`
            : `# ${doc.title ?? 'Untitled'}`;
          text = `${heading}\n\n${formattedContent}`;
        } else {
          text = JSON.stringify(
            {
              document_id: doc.documentId,
              title: doc.title,
              revision_id: doc.revisionId,
              tabs: effectiveTabs,
            },
            null,
            2
          );
        }

        return {
          content: [{ type: 'text', text: truncateIfNeeded(text) }],
          structuredContent: {
            document_id: doc.documentId,
            title: doc.title,
            tabs: effectiveTabs,
          },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
