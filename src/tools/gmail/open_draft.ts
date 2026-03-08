import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { execSync } from 'child_process';
import { getGmail } from './shared.js';
import { handleGoogleError } from '../../utils/errors.js';

export function registerOpenDraft(server: McpServer): void {
  server.registerTool(
    'google_gmail_open_draft',
    {
      inputSchema: z.object({
        draft_id: z.string().describe('Draft ID to open in Chrome'),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args) => {
      try {
        const gmail = getGmail();
        const res = await gmail.users.drafts.get({ userId: 'me', id: args.draft_id });
        const messageId = res.data.message?.id ?? '';
        const url = `https://mail.google.com/mail/u/0/#drafts/${messageId}`;
        execSync(`open -a "Google Chrome" "${url}"`);
        return {
          content: [{ type: 'text', text: `Opened draft in Chrome.\n\nURL: ${url}` }],
          structuredContent: { draft_id: args.draft_id, message_id: messageId, url },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
