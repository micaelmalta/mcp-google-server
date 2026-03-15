import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getGmail } from './shared.js';
import { handleGoogleError } from '../../utils/errors.js';

export function registerDeleteFilter(server: McpServer): void {
  server.registerTool(
    'google_gmail_delete_filter',
    {
      title: 'Delete Gmail Filter',
      description: `Permanently deletes a Gmail filter by its ID. This action cannot be undone.

Args:
  - filter_id: Filter ID from google_gmail_list_filters

Returns:
  - filter_id: The deleted filter ID`,
      inputSchema: z.object({
        filter_id: z.string().min(1).describe('Filter ID to delete.'),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ filter_id }) => {
      try {
        const gmail = getGmail();
        await gmail.users.settings.filters.delete({ userId: 'me', id: filter_id });
        return {
          content: [{ type: 'text', text: `Filter \`${filter_id}\` deleted.` }],
          structuredContent: { filter_id },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
