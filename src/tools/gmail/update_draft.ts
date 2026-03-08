import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getGmail } from './shared.js';
import { handleGoogleError } from '../../utils/errors.js';
import { composeRawEmail } from '../../utils/format.js';

export function registerUpdateDraft(server: McpServer): void {
  server.registerTool(
    'google_gmail_update_draft',
    {
      inputSchema: z.object({
        draft_id: z.string().describe('Draft ID to update'),
        to: z.string().describe('Recipient email address'),
        subject: z.string().describe('Email subject'),
        body: z.string().describe('Email body text'),
        cc: z.string().optional().describe('CC email addresses (comma-separated)'),
        bcc: z.string().optional().describe('BCC recipients, comma-separated'),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) => {
      try {
        const gmail = getGmail();
        const raw = await composeRawEmail({ to: args.to, subject: args.subject, body: args.body, cc: args.cc, bcc: args.bcc });
        const res = await gmail.users.drafts.update({
          userId: 'me',
          id: args.draft_id,
          requestBody: { message: { raw } },
        });
        const draftId = res.data.id ?? '';
        const messageId = res.data.message?.id ?? '';
        return {
          content: [{ type: 'text', text: `Draft updated successfully.\n\nDraft ID: ${draftId}\nTo: ${args.to}\nSubject: ${args.subject}` }],
          structuredContent: { draft_id: draftId, message_id: messageId },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
