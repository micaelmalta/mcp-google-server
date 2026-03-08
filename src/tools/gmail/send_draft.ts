import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getGmail } from './shared.js';
import { handleGoogleError } from '../../utils/errors.js';

export function registerSendDraft(server: McpServer): void {
  server.registerTool(
    'google_gmail_send_draft',
    {
      title: 'Send a Gmail Draft',
      description: `Sends an existing Gmail draft by its ID.

Args:
  - draft_id: The draft ID to send

Returns:
  - message_id: ID of the sent message
  - thread_id: Thread ID
  - subject, to, cc, date: Headers from the sent message`,
      inputSchema: z.object({
        draft_id: z.string().describe('Draft ID to send'),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (args) => {
      try {
        const gmail = getGmail();

        const sendRes = await gmail.users.drafts.send({
          userId: 'me',
          requestBody: { id: args.draft_id },
        });
        const messageId = sendRes.data.id ?? '';
        const threadId = sendRes.data.threadId ?? '';

        const msgRes = await gmail.users.messages.get({
          userId: 'me',
          id: messageId,
          format: 'metadata',
          metadataHeaders: ['To', 'Cc', 'Subject', 'Date'],
        });
        const headers = msgRes.data.payload?.headers ?? [];
        const hmap = Object.fromEntries(
          headers.map((h: { name?: string | null; value?: string | null }) => [h.name?.toLowerCase() ?? '', h.value ?? ''])
        );

        const subject = hmap['subject'] ?? '(no subject)';
        const to = hmap['to'] ?? '';
        const cc = hmap['cc'] || undefined;
        const date = hmap['date'] ?? '';

        const markdown = `Draft sent successfully.\n\n**Subject:** ${subject}\n**To:** ${to}${cc ? `\n**Cc:** ${cc}` : ''}\n**Date:** ${date}`;
        return {
          content: [{ type: 'text' as const, text: markdown }],
          structuredContent: { message_id: messageId, thread_id: threadId, subject, to, cc, date },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text' as const, text: handleGoogleError(error) }] };
      }
    }
  );
}
