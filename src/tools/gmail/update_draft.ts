import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getGmail } from './shared.js';
import { handleGoogleError } from '../../utils/errors.js';
import { composeRawEmail } from '../../utils/format.js';

export function registerUpdateDraft(server: McpServer): void {
  server.registerTool(
    'google_gmail_update_draft',
    {
      title: 'Update a Gmail Draft',
      description: `Replaces the content of an existing Gmail draft. Automatically preserves threading headers (In-Reply-To, References, threadId) so reply drafts continue to thread correctly after being updated.

Args:
  - draft_id: The ID of the draft to update (required)
  - to: Recipient email address(es), comma-separated (required)
  - subject: Email subject (required)
  - body: Email body text (required)
  - cc: CC recipients, comma-separated
  - bcc: BCC recipients, comma-separated

Returns:
  - draft_id: ID of the updated draft
  - message_id: Underlying message ID`,
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

        // Fetch existing draft to preserve threading headers (In-Reply-To, References, threadId)
        // so reply drafts continue to thread correctly after content is updated.
        const existingRes = await gmail.users.drafts.get({ userId: 'me', id: args.draft_id });
        const existingHeaders = existingRes.data.message?.payload?.headers ?? [];
        const hmap: Record<string, string> = {};
        for (const h of existingHeaders) {
          if (h.name && h.value) hmap[h.name.toLowerCase()] = h.value;
        }
        const inReplyTo = hmap['in-reply-to'];
        const references = hmap['references'];
        const threadId = existingRes.data.message?.threadId ?? undefined;

        const raw = await composeRawEmail({
          to: args.to, subject: args.subject, body: args.body,
          cc: args.cc, bcc: args.bcc, inReplyTo, references,
        });
        const res = await gmail.users.drafts.update({
          userId: 'me',
          id: args.draft_id,
          requestBody: { message: { raw, threadId } },
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
