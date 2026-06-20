import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getDocs } from './shared.js';
import { getDrive } from '../drive/shared.js';
import { handleGoogleError } from '../../utils/errors.js';

export function registerDocsReplaceContent(server: McpServer): void {
  server.registerTool(
    'google_docs_replace_content',
    {
      title: 'Replace Google Doc Content',
      description: `Replaces the ENTIRE body of an existing Google Doc. This is destructive:
the current content is fully overwritten. Google Docs version history can be used to recover prior content.

Args:
  - document_id: Document ID (required)
  - content: Replacement content — plain text or Markdown (required)
  - format: Content format — "plain" (default) or "markdown" (converts Markdown to real Doc formatting: headings, bold, lists, tables, links)`,
      inputSchema: z
        .object({
          document_id: z.string().min(1).describe('Document ID.'),
          content: z.string().describe('Replacement content (plain text or Markdown).'),
          format: z.enum(['plain', 'markdown']).optional().default('plain').describe('Content format: "plain" (default) or "markdown".'),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ document_id, content, format }) => {
      if (content === undefined) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'content is required.' }],
        };
      }

      try {
        if (format === 'markdown') {
          const drive = getDrive();
          await drive.files.update({
            fileId: document_id,
            media: { mimeType: 'text/markdown', body: content },
          });
        } else {
          const docs = getDocs();
          const current = await docs.documents.get({ documentId: document_id });
          const endIndex = current.data.body?.content?.at(-1)?.endIndex ?? 1;
          const requests: Array<Record<string, unknown>> = [];
          // Body content always starts at index 1; the final newline (endIndex-1..endIndex)
          // cannot be deleted, so delete [1, endIndex-1) only when there is real content.
          if (endIndex - 1 > 1) {
            requests.push({ deleteContentRange: { range: { startIndex: 1, endIndex: endIndex - 1 } } });
          }
          requests.push({ insertText: { location: { index: 1 }, text: content } });
          await docs.documents.batchUpdate({ documentId: document_id, requestBody: { requests } });
        }

        const webViewLink = `https://docs.google.com/document/d/${document_id}/edit`;
        return {
          content: [
            {
              type: 'text',
              text: `Document body replaced for \`${document_id}\`.\n- [Open Document](${webViewLink})`,
            },
          ],
          structuredContent: { document_id, web_view_link: webViewLink },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
