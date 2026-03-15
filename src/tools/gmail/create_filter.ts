import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getGmail, formatFilter, buildCriteria, buildAction } from './shared.js';
import { handleGoogleError } from '../../utils/errors.js';

export function registerCreateFilter(server: McpServer): void {
  server.registerTool(
    'google_gmail_create_filter',
    {
      title: 'Create Gmail Filter',
      description: `Creates a new Gmail filter that automatically applies actions to matching incoming mail.

Args (criteria — at least one required):
  - from: Sender address to match
  - to: Recipient address to match
  - subject: Subject line to match
  - query: Arbitrary Gmail search query

Args (actions — at least one required):
  - add_labels: Comma-separated label IDs to add (e.g. "Label_123,STARRED")
  - remove_labels: Comma-separated label IDs to remove
  - skip_inbox: Archive matching mail (removes INBOX label)
  - mark_as_read: Mark matching mail as read (removes UNREAD label)
  - mark_as_important: Mark matching mail as important (adds IMPORTANT label)

Returns:
  - filter.id: ID of the created filter
  - filter.criteria: Stored match conditions
  - filter.action: Stored label actions`,
      inputSchema: z.object({
        from:              z.string().optional().describe('Sender address to match.'),
        to:                z.string().optional().describe('Recipient address to match.'),
        subject:           z.string().optional().describe('Subject line to match.'),
        query:             z.string().optional().describe('Arbitrary Gmail search query.'),
        add_labels:        z.string().optional().describe('Comma-separated label IDs to add.'),
        remove_labels:     z.string().optional().describe('Comma-separated label IDs to remove.'),
        skip_inbox:        z.boolean().optional().describe('Archive matching mail.'),
        mark_as_read:      z.boolean().optional().describe('Mark matching mail as read.'),
        mark_as_important: z.boolean().optional().describe('Mark matching mail as important.'),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args) => {
      const { from, to, subject, query, add_labels, remove_labels, skip_inbox, mark_as_read, mark_as_important } = args;

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
        const res = await gmail.users.settings.filters.create({
          userId: 'me',
          requestBody: { criteria, action },
        });
        const filter = formatFilter(res.data);
        return {
          content: [{ type: 'text', text: `Filter created with ID \`${filter.id}\`.` }],
          structuredContent: { filter },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
