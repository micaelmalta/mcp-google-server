import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getDocs } from './shared.js';
import { getDrive } from '../drive/shared.js';
import { handleGoogleError } from '../../utils/errors.js';

export function registerDocsCreate(server: McpServer): void {
  server.registerTool(
    'google_docs_create',
    {
      title: 'Create a Google Doc',
      description: `Creates a new Google Docs document with optional initial content.

Provide at most one of:
  - content: Initial plain text (inserted literally, no formatting)
  - markdown: Markdown converted to real Doc formatting (headings, bold, lists, tables, links)

Args:
  - title: Document title (required)
  - content: Initial plain text content
  - markdown: Initial Markdown content (mutually exclusive with content)

Returns:
  - document_id: ID to use in google_docs_get and google_docs_append_text
  - web_view_link: URL to open the document`,
      inputSchema: z
        .object({
          title: z.string().min(1).describe('Document title.'),
          content: z.string().optional().describe('Initial plain text content.'),
          markdown: z.string().optional().describe('Initial Markdown content (mutually exclusive with content).'),
        })
        .strict()
        .refine((d) => !(d.content !== undefined && d.markdown !== undefined), {
          message: 'Provide only one of content or markdown, not both.',
        }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ title, content, markdown }) => {
      try {
        let docId: string;

        if (markdown !== undefined) {
          const drive = getDrive();
          const res = await drive.files.create({
            requestBody: { name: title, mimeType: 'application/vnd.google-apps.document' },
            media: { mimeType: 'text/markdown', body: markdown },
            fields: 'id',
          });
          docId = res.data.id!;
        } else {
          const docs = getDocs();
          const createRes = await docs.documents.create({ requestBody: { title } });
          docId = createRes.data.documentId!;
          if (content) {
            await docs.documents.batchUpdate({
              documentId: docId,
              requestBody: {
                requests: [{ insertText: { location: { index: 1 }, text: content } }],
              },
            });
          }
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
}
