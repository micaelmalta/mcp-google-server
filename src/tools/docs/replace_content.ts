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

Provide exactly one of:
  - content: Plain text (inserted literally, no formatting)
  - markdown: Markdown converted to real Doc formatting (headings, bold, lists, tables, links)

Args:
  - document_id: Document ID (required)
  - content: Replacement plain text
  - markdown: Replacement Markdown (mutually exclusive with content)`,
      inputSchema: z
        .object({
          document_id: z.string().min(1).describe('Document ID.'),
          content: z.string().optional().describe('Replacement plain text.'),
          markdown: z.string().optional().describe('Replacement Markdown (mutually exclusive with content).'),
        })
        .strict()
        .refine((d) => (d.content !== undefined) !== (d.markdown !== undefined), {
          message: 'Provide exactly one of content or markdown.',
        }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ document_id, content, markdown }) => {
      if ((content !== undefined) === (markdown !== undefined)) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Provide exactly one of content or markdown.' }],
        };
      }

      try {
        if (markdown !== undefined) {
          const drive = getDrive();
          await drive.files.update({
            fileId: document_id,
            media: { mimeType: 'text/markdown', body: markdown },
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
          requests.push({ insertText: { location: { index: 1 }, text: content! } });
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
