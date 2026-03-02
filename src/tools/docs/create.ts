import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getDocs } from './shared.js';
import { handleGoogleError } from '../../utils/errors.js';

export function registerDocsCreate(server: McpServer): void {
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
}
