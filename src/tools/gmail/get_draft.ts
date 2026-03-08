import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getGmail } from './shared.js';
import { handleGoogleError } from '../../utils/errors.js';
import { extractEmailBody } from '../../utils/format.js';

export function registerGetDraft(server: McpServer): void {
  server.registerTool(
    'google_gmail_get_draft',
    {
      title: 'Get a Gmail Draft',
      description: `Retrieves the full content of a Gmail draft by its ID.

Args:
  - draft_id: The draft ID to retrieve

Returns:
  - draft_id: The draft ID
  - message_id: Underlying message ID
  - subject, to, from, date: Email headers
  - body: Decoded email body text`,
      inputSchema: z.object({
        draft_id: z.string().describe('Draft ID to retrieve'),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) => {
      try {
        const gmail = getGmail();
        const res = await gmail.users.drafts.get({ userId: 'me', id: args.draft_id });
        const draft = res.data;
        const headers = draft.message?.payload?.headers ?? [];
        const hmap = Object.fromEntries(headers.map((h: { name?: string | null; value?: string | null }) => [h.name?.toLowerCase() ?? '', h.value ?? '']));
        const body = extractEmailBody(draft.message?.payload ?? null);
        const subject = hmap['subject'] ?? '(no subject)';
        const to = hmap['to'] ?? '';
        const from = hmap['from'] ?? '';
        const date = hmap['date'] ?? '';
        const draftId = draft.id ?? '';
        const messageId = draft.message?.id ?? '';

        const markdown = `**Subject:** ${subject}\n**To:** ${to}\n**From:** ${from}\n**Date:** ${date}\n\n---\n\n${body}`;
        return {
          content: [{ type: 'text', text: markdown }],
          structuredContent: { draft_id: draftId, message_id: messageId, subject, to, from, date, body },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
