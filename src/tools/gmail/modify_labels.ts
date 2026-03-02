import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getGmail } from './shared.js';
import { handleGoogleError } from '../../utils/errors.js';

export function registerModifyLabels(server: McpServer): void {
  server.registerTool(
    'google_gmail_modify_labels',
    {
      title: 'Modify Gmail Message Labels',
      description: `Adds or removes labels from one or more Gmail messages.

Common label IDs:
  - INBOX, SENT, TRASH, SPAM, STARRED, UNREAD
  - Custom labels have IDs like "Label_12345" (get IDs from google_gmail_list_labels)

Args:
  - message_ids: Comma-separated message IDs to modify
  - add_labels: Comma-separated label IDs to add
  - remove_labels: Comma-separated label IDs to remove

Examples:
  - Mark as read: remove_labels="UNREAD"
  - Archive: remove_labels="INBOX"
  - Star: add_labels="STARRED"
  - Move to trash: add_labels="TRASH", remove_labels="INBOX"`,
      inputSchema: z.object({
        message_ids: z.string().min(1).describe('Comma-separated message IDs.'),
        add_labels: z.string().optional().describe('Comma-separated label IDs to add.'),
        remove_labels: z.string().optional().describe('Comma-separated label IDs to remove.'),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ message_ids, add_labels, remove_labels }) => {
      try {
        if (!add_labels && !remove_labels) {
          return {
            isError: true,
            content: [{ type: 'text', text: 'Error: At least one of add_labels or remove_labels must be provided.' }],
          };
        }

        const gmail = getGmail();
        const ids = message_ids.split(',').map((id) => id.trim());

        await gmail.users.messages.batchModify({
          userId: 'me',
          requestBody: {
            ids,
            addLabelIds: add_labels ? add_labels.split(',').map((l) => l.trim()) : undefined,
            removeLabelIds: remove_labels ? remove_labels.split(',').map((l) => l.trim()) : undefined,
          },
        });

        return {
          content: [
            {
              type: 'text',
              text: `Labels updated for ${ids.length} message(s).\n- Added: ${add_labels ?? 'none'}\n- Removed: ${remove_labels ?? 'none'}`,
            },
          ],
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
