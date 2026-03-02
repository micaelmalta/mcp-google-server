import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getGmail } from './shared.js';
import { ResponseFormat } from '../../types.js';
import { handleGoogleError } from '../../utils/errors.js';
import { truncateIfNeeded } from '../../utils/format.js';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../constants.js';

export function registerListThreads(server: McpServer): void {
  server.registerTool(
    'google_gmail_list_threads',
    {
      title: 'List Gmail Threads',
      description: `Lists Gmail conversation threads matching an optional search query.

A thread groups all messages in the same conversation. Useful for reading full conversations.

Args:
  - query: Gmail search query (same syntax as google_gmail_list_messages)
  - limit: Max threads (1-${MAX_PAGE_SIZE}, default: ${DEFAULT_PAGE_SIZE})
  - page_token: Pagination token

Returns:
  - threads[].id: Thread ID (use with google_gmail_get_thread)
  - threads[].snippet: Preview snippet
  - threads[].history_id: History ID for change detection`,
      inputSchema: z.object({
        query: z.string().optional(),
        limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
        page_token: z.string().optional(),
        response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ query, limit, page_token, response_format }) => {
      try {
        const gmail = getGmail();
        const res = await gmail.users.threads.list({
          userId: 'me',
          q: query,
          maxResults: limit,
          pageToken: page_token,
        });

        const threads = (res.data.threads ?? []).map((t) => ({
          id: t.id ?? '',
          snippet: t.snippet ?? '',
          history_id: t.historyId ?? '',
        }));

        const nextPageToken = res.data.nextPageToken ?? undefined;

        let text: string;
        if (response_format === ResponseFormat.MARKDOWN) {
          const lines = [`# Gmail Threads (${threads.length})`, ''];
          for (const t of threads) {
            lines.push(`- **ID**: \`${t.id}\` — ${t.snippet.slice(0, 100)}`);
          }
          if (nextPageToken) lines.push(`\n*Use page_token="${nextPageToken}" for next page.*`);
          text = lines.join('\n');
        } else {
          text = JSON.stringify({ threads, next_page_token: nextPageToken, has_more: !!nextPageToken }, null, 2);
        }

        return {
          content: [{ type: 'text', text: truncateIfNeeded(text) }],
          structuredContent: { threads, next_page_token: nextPageToken, has_more: !!nextPageToken },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
