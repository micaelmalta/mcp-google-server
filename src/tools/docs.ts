import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { google } from 'googleapis';
import { z } from 'zod';
import { requireAuth } from '../auth/oauth.js';
import { ResponseFormat } from '../types.js';
import { handleGoogleError } from '../utils/errors.js';
import { truncateIfNeeded } from '../utils/format.js';

function getDocs() {
  return google.docs({ version: 'v1', auth: requireAuth() });
}

export function registerDocsTools(server: McpServer): void {
  // ─── google_docs_create ───────────────────────────────────────────────────
  server.registerTool(
    'google_docs_create',
    {
      title: 'Create a Google Doc',
      description: `Creates a new Google Docs document with optional initial content.

Args:
  - title: Document title (required)
  - content: Initial plain text content to add to the document

Returns:
  - document_id: ID to use in google_docs_get and google_docs_append_text
  - web_view_link: URL to open the document`,
      inputSchema: z.object({
        title: z.string().min(1).describe('Document title.'),
        content: z.string().optional().describe('Initial document content.'),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ title, content }) => {
      try {
        const docs = getDocs();
        const createRes = await docs.documents.create({ requestBody: { title } });
        const docId = createRes.data.documentId!;

        if (content) {
          await docs.documents.batchUpdate({
            documentId: docId,
            requestBody: {
              requests: [{ insertText: { location: { index: 1 }, text: content } }],
            },
          });
        }

        const webViewLink = `https://docs.google.com/document/d/${docId}/edit`;

        return {
          content: [
            {
              type: 'text',
              text: `Google Doc created: **${title}**\n- ID: \`${docId}\`\n- [Open Document](${webViewLink})`,
            },
          ],
          structuredContent: { document_id: docId, title, web_view_link: webViewLink },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );

  // ─── google_docs_get ──────────────────────────────────────────────────────
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

        // Build tabs array from API response
        const rawTabs = doc.tabs ?? [];
        const tabsData: TabData[] = rawTabs.length > 0
          ? rawTabs.map((t, i) => ({
              tab_id: t.tabProperties?.tabId ?? `tab_${i}`,
              title: t.tabProperties?.title ?? `Tab ${i + 1}`,
              index: t.tabProperties?.index ?? i,
              text_content: extractTabText(t),
            }))
          : [
              // Fallback for docs that don't return tabs (older docs / no tabs)
              {
                tab_id: 'tab_0',
                title: 'Main',
                index: 0,
                text_content: extractTabText({ documentTab: { body: doc.body ?? null } }),
              },
            ];

        // Resolve effective tabs before formatting
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

  // ─── google_docs_append_text ──────────────────────────────────────────────
  server.registerTool(
    'google_docs_append_text',
    {
      title: 'Append Text to a Google Doc',
      description: `Appends text to the end of a Google Docs document.

Args:
  - document_id: Document ID
  - text: Text to append (supports newlines with \\n)
  - add_newline_before: Add a blank line before the appended text (default: true)`,
      inputSchema: z.object({
        document_id: z.string().min(1).describe('Document ID.'),
        text: z.string().min(1).describe('Text to append.'),
        add_newline_before: z.boolean().default(true),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ document_id, text, add_newline_before }) => {
      try {
        const docs = getDocs();

        // Get current document to find the end index
        const current = await docs.documents.get({ documentId: document_id });
        const endIndex = current.data.body?.content?.at(-1)?.endIndex ?? 1;
        const insertIndex = endIndex - 1; // Before the final newline

        const insertText = add_newline_before ? `\n${text}` : text;

        await docs.documents.batchUpdate({
          documentId: document_id,
          requestBody: {
            requests: [{ insertText: { location: { index: insertIndex }, text: insertText } }],
          },
        });

        return {
          content: [
            {
              type: 'text',
              text: `Text appended to document \`${document_id}\`.\n- [Open Document](https://docs.google.com/document/d/${document_id}/edit)`,
            },
          ],
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}

// ─── Exported Helpers (testable) ──────────────────────────────────────────────

/**
 * Extracts plain text from a single Google Docs tab.
 */
export function extractTabText(tab: {
  documentTab?: {
    body?: {
      content?: Array<{
        paragraph?: {
          elements?: Array<{
            textRun?: { content?: string | null } | null;
          }> | null;
        } | null;
      }> | null;
    } | null;
  } | null;
}): string {
  const lines: string[] = [];
  for (const element of tab.documentTab?.body?.content ?? []) {
    if (element.paragraph) {
      const text = (element.paragraph.elements ?? [])
        .map((el) => el.textRun?.content ?? '')
        .join('');
      if (text.trim()) lines.push(text);
    }
  }
  return lines.join('').trim();
}

export interface TabData {
  tab_id: string;
  title: string;
  index: number;
  text_content: string;
}

/**
 * Formats tabs data into a markdown string.
 * - Single tab: returns content directly (no header)
 * - Multiple tabs: prefixes each with "## Tab: {title}"
 * - With filter: returns only the matching tab, or an error message
 */
export function formatDocTabs(tabs: TabData[], tabFilter?: string): string {
  if (tabFilter) {
    const lower = tabFilter.toLowerCase();
    const match = tabs.find(
      (t) => t.title.toLowerCase() === lower || t.tab_id === tabFilter
    );
    if (!match) {
      const available = tabs.map((t) => `${t.title} (${t.tab_id})`).join(', ');
      return `Tab "${tabFilter}" not found. Available tabs: ${available}`;
    }
    return match.text_content;
  }

  if (tabs.length === 1) {
    return tabs[0].text_content;
  }

  return tabs
    .map((t) => `## Tab: ${t.title}\n${t.text_content}`)
    .join('\n\n');
}
