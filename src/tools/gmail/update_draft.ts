import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getGmail } from './shared.js';
import { handleGoogleError } from '../../utils/errors.js';
import { composeRawEmail, extractEmailBody } from '../../utils/format.js';

export function registerUpdateDraft(server: McpServer): void {
  server.registerTool(
    'google_gmail_update_draft',
    {
      title: 'Update a Gmail Draft',
      description: `Replaces the content of an existing Gmail draft. All fields are optional and default to the existing draft's values, so you can update just the body without re-supplying recipients. Threading headers (In-Reply-To, References, threadId) are always preserved so reply drafts continue to thread correctly.

Args:
  - draft_id: The ID of the draft to update (required)
  - to: Recipient email address(es), comma-separated. Defaults to existing.
  - subject: Email subject. Defaults to existing.
  - body: Email body text. Defaults to existing.
  - cc: CC recipients, comma-separated. Defaults to existing. Pass empty string to clear.
  - bcc: BCC recipients, comma-separated. Defaults to existing. Pass empty string to clear.

Returns:
  - draft_id: ID of the updated draft
  - message_id: Underlying message ID`,
      inputSchema: z.object({
        draft_id: z.string().describe('Draft ID to update'),
        to: z.string().optional().describe('Recipient email address(es). Defaults to existing draft value.'),
        subject: z.string().optional().describe('Email subject. Defaults to existing draft value.'),
        body: z.string().optional().describe('Email body text. Defaults to existing draft body.'),
        cc: z.string().optional().describe('CC email addresses (comma-separated). Defaults to existing. Pass empty string to clear.'),
        bcc: z.string().optional().describe('BCC recipients, comma-separated. Defaults to existing. Pass empty string to clear.'),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) => {
      try {
        const gmail = getGmail();

        // Fetch existing draft to read current field values and preserve threading headers.
        const existingRes = await gmail.users.drafts.get({ userId: 'me', id: args.draft_id });
        const existingMsg = existingRes.data.message;
        const existingHeaders = existingMsg?.payload?.headers ?? [];
        const hmap: Record<string, string> = {};
        for (const h of existingHeaders) {
          if (h.name && h.value) hmap[h.name.toLowerCase()] = h.value;
        }

        // Apply caller overrides over existing values; undefined means "keep existing".
        const effectiveTo = args.to ?? hmap['to'] ?? '';
        const effectiveSubject = args.subject ?? hmap['subject'] ?? '';
        const effectiveCc = args.cc !== undefined ? args.cc : hmap['cc'];
        const effectiveBcc = args.bcc !== undefined ? args.bcc : hmap['bcc'];
        const effectiveBody = args.body ?? extractEmailBody(existingMsg?.payload ?? null);

        const inReplyTo = hmap['in-reply-to'];
        const references = hmap['references'];
        const threadId = existingMsg?.threadId ?? undefined;

        const raw = await composeRawEmail({
          to: effectiveTo,
          subject: effectiveSubject,
          body: effectiveBody,
          cc: effectiveCc,
          bcc: effectiveBcc,
          inReplyTo,
          references,
        });
        const res = await gmail.users.drafts.update({
          userId: 'me',
          id: args.draft_id,
          requestBody: { message: { raw, threadId } },
        });
        const draftId = res.data.id ?? '';
        const messageId = res.data.message?.id ?? '';
        return {
          content: [{ type: 'text', text: `Draft updated successfully.\n\nDraft ID: ${draftId}\nTo: ${effectiveTo}\nSubject: ${effectiveSubject}` }],
          structuredContent: { draft_id: draftId, message_id: messageId },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
