import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getGmail } from './shared.js';
import { handleGoogleError } from '../../utils/errors.js';
import { ResponseFormat } from '../../types.js';

export function registerListDrafts(server: McpServer): void {
  server.registerTool(
    'google_gmail_list_drafts',
    {
      title: 'List Gmail Drafts',
      description: `Lists Gmail drafts with subject, recipient, and draft ID.

Args:
  - limit: Max drafts to return (1–100, default 20)
  - page_token: Pagination token from a previous call
  - response_format: 'markdown' (default) or 'json'

Returns:
  - items[]: Array of { draft_id, message_id, subject, to, date }
  - has_more: Whether more pages exist
  - total_returned: Count of items in this page
  - next_page_token: Token for the next page`,
      inputSchema: z.object({
        limit: z.number().int().min(1).max(100).default(20).describe('Max drafts to return'),
        page_token: z.string().optional().describe('Pagination token from previous call'),
        response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN).describe("Output format: 'markdown' or 'json'"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async (args) => {
      try {
        const gmail = getGmail();
        const listRes = await gmail.users.drafts.list({
          userId: 'me',
          maxResults: args.limit,
          pageToken: args.page_token,
        });
        const draftRefs = listRes.data.drafts ?? [];
        const nextPageToken = listRes.data.nextPageToken;

        if (draftRefs.length === 0) {
          return {
            content: [{ type: 'text', text: 'No drafts found.' }],
            structuredContent: { items: [], has_more: false, total_returned: 0, next_page_token: undefined },
          };
        }

        // Gmail's drafts.list returns stubs only; a separate drafts.get per draft is required
        // to retrieve headers (subject, to, date). This results in N+1 API calls by design.
        const details = await Promise.all(
          draftRefs.map((ref) => gmail.users.drafts.get({
            userId: 'me',
            id: ref.id!,
            format: 'metadata',
          }))
        );

        const items = details.map((res) => {
          const draft = res.data;
          const headers = draft.message?.payload?.headers ?? [];
          const hmap = Object.fromEntries(headers.map((h: { name?: string | null; value?: string | null }) => [h.name ?? '', h.value ?? '']));
          return {
            draft_id: draft.id ?? '',
            message_id: draft.message?.id ?? '',
            subject: hmap['Subject'] ?? '(no subject)',
            to: hmap['To'] ?? '',
            date: hmap['Date'] ?? '',
          };
        });

        const hasMore = !!nextPageToken;

        if (args.response_format === ResponseFormat.JSON) {
          const json = JSON.stringify({ items, has_more: hasMore, total_returned: items.length, next_page_token: nextPageToken }, null, 2);
          return {
            content: [{ type: 'text', text: json }],
            structuredContent: { items, has_more: hasMore, total_returned: items.length, next_page_token: nextPageToken },
          };
        }

        const lines = items.map((d) => `- **${d.subject}** → ${d.to} \`${d.draft_id}\``);
        const text = `Found ${items.length} draft(s):\n\n${lines.join('\n')}${hasMore ? `\n\nNext page token: \`${nextPageToken}\`` : ''}`;
        return {
          content: [{ type: 'text', text }],
          structuredContent: { items, has_more: hasMore, total_returned: items.length, next_page_token: nextPageToken },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
