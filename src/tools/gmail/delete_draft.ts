import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getGmail } from './shared.js';
import { handleGoogleError } from '../../utils/errors.js';

export function registerDeleteDraft(server: McpServer): void {
  server.registerTool(
    'google_gmail_delete_draft',
    {
      inputSchema: z.object({
        draft_id: z.string().describe('Draft ID to permanently delete'),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (args) => {
      try {
        const gmail = getGmail();
        await gmail.users.drafts.delete({ userId: 'me', id: args.draft_id });
        return {
          content: [{ type: 'text', text: `Draft ${args.draft_id} deleted successfully.` }],
          structuredContent: { draft_id: args.draft_id, deleted: true },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
