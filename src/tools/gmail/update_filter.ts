import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getGmail, formatFilter, buildCriteria, buildAction } from './shared.js';
import { handleGoogleError } from '../../utils/errors.js';

export function registerUpdateFilter(server: McpServer): void {
  server.registerTool(
    'google_gmail_update_filter',
    {
      title: 'Update Gmail Filter',
      description: `Replaces an existing Gmail filter by deleting it and creating a new one with updated settings.

⚠️ Not atomic: if create fails after delete, the original filter is lost. If delete fails, create is not attempted.

Args:
  - filter_id: ID of the filter to replace (from google_gmail_list_filters)

Args (criteria — at least one required):
  - from: Sender address to match
  - to: Recipient address to match
  - subject: Subject line to match
  - query: Arbitrary Gmail search query

Args (actions — at least one required):
  - add_labels: Comma-separated label IDs to add
  - remove_labels: Comma-separated label IDs to remove
  - skip_inbox: Archive matching mail (removes INBOX label)
  - mark_as_read: Mark matching mail as read (removes UNREAD label)
  - mark_as_important: Mark matching mail as important (adds IMPORTANT label)

Returns:
  - filter.id: ID of the newly created filter (different from original)`,
      inputSchema: z.object({
        filter_id:         z.string().min(1).describe('Filter ID to replace.'),
        from:              z.string().optional(),
        to:                z.string().optional(),
        subject:           z.string().optional(),
        query:             z.string().optional(),
        add_labels:        z.string().optional(),
        remove_labels:     z.string().optional(),
        skip_inbox:        z.boolean().optional(),
        mark_as_read:      z.boolean().optional(),
        mark_as_important: z.boolean().optional(),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (args) => {
      const { filter_id, from, to, subject, query, add_labels, remove_labels, skip_inbox, mark_as_read, mark_as_important } = args;

      const criteria = buildCriteria({ from, to, subject, query });
      if (Object.keys(criteria).length === 0) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Error: At least one criteria field (from, to, subject, query) must be provided.' }],
        };
      }

      const action = buildAction({ add_labels, remove_labels, skip_inbox, mark_as_read, mark_as_important });
      if (action.addLabelIds.length === 0 && action.removeLabelIds.length === 0) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Error: At least one action must be provided (add_labels, remove_labels, skip_inbox, mark_as_read, or mark_as_important).' }],
        };
      }

      try {
        const gmail = getGmail();
        await gmail.users.settings.filters.delete({ userId: 'me', id: filter_id });
        const res = await gmail.users.settings.filters.create({
          userId: 'me',
          requestBody: { criteria, action },
        });
        const filter = formatFilter(res.data);
        return {
          content: [{ type: 'text', text: `Filter updated. New filter ID: \`${filter.id}\`.` }],
          structuredContent: { filter },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
