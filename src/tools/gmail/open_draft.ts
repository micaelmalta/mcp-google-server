import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { execFileSync } from 'child_process';
import { getGmail } from './shared.js';
import { handleGoogleError } from '../../utils/errors.js';

export function registerOpenDraft(server: McpServer): void {
  server.registerTool(
    'google_gmail_open_draft',
    {
      title: 'Open Gmail Draft in Chrome',
      description: `Opens a Gmail draft in Google Chrome (macOS only).

Args:
  - draft_id: The draft ID to open

Returns:
  - draft_id: The draft ID
  - message_id: The underlying message ID
  - url: The Gmail URL that was opened`,
      inputSchema: z.object({
        draft_id: z.string().describe('Draft ID to open in Chrome'),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) => {
      try {
        const gmail = getGmail();
        const res = await gmail.users.drafts.get({ userId: 'me', id: args.draft_id });
        const messageId = res.data.message?.id ?? '';
        const url = `https://mail.google.com/mail/u/0/#drafts/${messageId}`;
        try {
          execFileSync('open', ['-a', 'Google Chrome', url]);
        } catch {
          return {
            isError: true,
            content: [{ type: 'text' as const, text: `Could not open Google Chrome. Make sure it is installed and you are on macOS.\n\nURL: ${url}` }],
          };
        }
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
