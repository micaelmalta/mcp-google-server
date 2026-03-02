import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getDocs } from './shared.js';
import { handleGoogleError } from '../../utils/errors.js';

export function registerDocsAppendText(server: McpServer): void {
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

        const current = await docs.documents.get({ documentId: document_id });
        const endIndex = current.data.body?.content?.at(-1)?.endIndex ?? 1;
        const insertIndex = endIndex - 1;

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
