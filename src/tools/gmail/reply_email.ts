import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getGmail } from './shared.js';
import { buildRawEmail } from '../../utils/format.js';
import { handleGoogleError } from '../../utils/errors.js';

export function registerReplyEmail(server: McpServer): void {
  server.registerTool(
    'google_gmail_reply_email',
    {
      title: 'Reply to a Gmail Thread',
      description: `Sends a reply to an existing Gmail thread.

Args:
  - message_id: ID of the message to reply to (use google_gmail_get_message to get thread details)
  - body: Plain text reply body

The reply will automatically be threaded to the correct conversation.

Returns:
  - message_id: ID of the sent reply
  - thread_id: Thread ID`,
      inputSchema: z.object({
        message_id: z.string().min(1).describe('ID of the message to reply to.'),
        body: z.string().min(1).describe('Reply body text.'),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ message_id, body }) => {
      try {
        const gmail = getGmail();

        const original = await gmail.users.messages.get({
          userId: 'me',
          id: message_id,
          format: 'metadata',
          metadataHeaders: ['From', 'Subject', 'Message-ID', 'References'],
        });

        const headers = (original.data.payload?.headers ?? []).reduce<Record<string, string>>((acc, h) => {
          if (h.name) acc[h.name.toLowerCase()] = h.value ?? '';
          return acc;
        }, {});

        const subject = headers['subject']?.startsWith('Re:')
          ? headers['subject']
          : `Re: ${headers['subject'] ?? ''}`;

        const raw = buildRawEmail({
          to: headers['from'] ?? '',
          subject,
          body,
          inReplyTo: headers['message-id'],
          references: [headers['references'], headers['message-id']].filter(Boolean).join(' '),
        });

        const res = await gmail.users.messages.send({
          userId: 'me',
          requestBody: { raw, threadId: original.data.threadId ?? undefined },
        });

        return {
          content: [
            {
              type: 'text',
              text: `Reply sent.\n- **To**: ${headers['from']}\n- **Subject**: ${subject}\n- **Message ID**: \`${res.data.id}\``,
            },
          ],
          structuredContent: { message_id: res.data.id, thread_id: res.data.threadId },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
