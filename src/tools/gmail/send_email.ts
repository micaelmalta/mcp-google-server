import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getGmail } from './shared.js';
import { buildRawEmail } from '../../utils/format.js';
import { handleGoogleError } from '../../utils/errors.js';

export function registerSendEmail(server: McpServer): void {
  server.registerTool(
    'google_gmail_send_email',
    {
      title: 'Send a Gmail Email',
      description: `Sends an email via Gmail.

Args:
  - to: Recipient email address (required)
  - subject: Email subject (required)
  - body: Plain text email body (required)
  - cc: Comma-separated CC email addresses
  - reply_to: Reply-To email address

Returns:
  - message_id: ID of the sent message
  - thread_id: Thread ID`,
      inputSchema: z.object({
        to: z.string().email().describe('Recipient email address.'),
        subject: z.string().min(1).describe('Email subject.'),
        body: z.string().min(1).describe('Plain text email body.'),
        cc: z.string().optional().describe('Comma-separated CC addresses.'),
        reply_to: z.string().email().optional().describe('Reply-To address.'),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ to, subject, body, cc, reply_to }) => {
      try {
        const gmail = getGmail();
        const raw = buildRawEmail({ to, subject, body, cc, replyTo: reply_to });

        const res = await gmail.users.messages.send({
          userId: 'me',
          requestBody: { raw },
        });

        return {
          content: [
            {
              type: 'text',
              text: `Email sent successfully.\n- **To**: ${to}\n- **Subject**: ${subject}\n- **Message ID**: \`${res.data.id}\``,
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
