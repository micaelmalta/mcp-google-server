import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getGmail } from './shared.js';
import { ResponseFormat } from '../../types.js';
import { handleGoogleError } from '../../utils/errors.js';
import { formatDate, truncateIfNeeded, extractEmailBody } from '../../utils/format.js';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../constants.js';

export function registerListMessages(server: McpServer): void {
  server.registerTool(
    'google_gmail_list_messages',
    {
      title: 'List Gmail Messages',
      description: `Lists Gmail messages matching an optional search query.

Supports Gmail's full search syntax (same as the Gmail search bar):
  - "from:alice@example.com" - from a specific sender
  - "subject:invoice" - subject contains word
  - "is:unread" - unread messages
  - "label:work" - messages with a label
  - "after:2024/01/01 before:2024/02/01" - date range
  - "has:attachment" - messages with attachments

Args:
  - query: Gmail search query (optional, returns all if omitted)
  - limit: Max messages to return (1-${MAX_PAGE_SIZE}, default: ${DEFAULT_PAGE_SIZE})
  - page_token: Token from previous call for pagination
  - include_body: Whether to include message body preview (default: false, uses more quota)
  - label_ids: Comma-separated label IDs to filter by (e.g., "INBOX,UNREAD")
  - response_format: 'markdown' or 'json'

Returns:
  - messages[].id: Message ID (use with google_gmail_get_message)
  - messages[].thread_id: Thread ID
  - messages[].from / to / subject / date: Common headers
  - messages[].snippet: Short preview of the message
  - next_page_token: Token for next page`,
      inputSchema: z.object({
        query: z.string().optional().describe('Gmail search query.'),
        limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
        page_token: z.string().optional(),
        include_body: z.boolean().default(false).describe('Include body preview (uses more API quota).'),
        label_ids: z.string().optional().describe("Comma-separated label IDs (e.g., 'INBOX,UNREAD')."),
        response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ query, limit, page_token, include_body, label_ids, response_format }) => {
      try {
        const gmail = getGmail();
        const listRes = await gmail.users.messages.list({
          userId: 'me',
          q: query,
          maxResults: limit,
          pageToken: page_token,
          labelIds: label_ids ? label_ids.split(',').map((l) => l.trim()) : undefined,
        });

        const messageRefs = listRes.data.messages ?? [];
        const nextPageToken = listRes.data.nextPageToken ?? undefined;

        if (messageRefs.length === 0) {
          return {
            content: [{ type: 'text', text: `No messages found${query ? ` matching "${query}"` : ''}.` }],
            structuredContent: { messages: [], has_more: false },
          };
        }

        const format = include_body ? 'full' : 'metadata';
        const metadataHeaders = ['From', 'To', 'Subject', 'Date'];

        const messages = await Promise.all(
          messageRefs.map(async (ref) => {
            const msg = await gmail.users.messages.get({
              userId: 'me',
              id: ref.id!,
              format,
              metadataHeaders: include_body ? undefined : metadataHeaders,
            });
            const data = msg.data;
            const headers = (data.payload?.headers ?? []).reduce<Record<string, string>>((acc, h) => {
              if (h.name) acc[h.name.toLowerCase()] = h.value ?? '';
              return acc;
            }, {});

            return {
              id: data.id ?? '',
              thread_id: data.threadId ?? '',
              from: headers['from'] ?? '',
              to: headers['to'] ?? '',
              subject: headers['subject'] ?? '(No subject)',
              date: headers['date'] ?? '',
              snippet: data.snippet ?? '',
              label_ids: data.labelIds ?? [],
              body: include_body ? extractEmailBody(data.payload) : undefined,
            };
          })
        );

        let text: string;
        if (response_format === ResponseFormat.MARKDOWN) {
          const lines = [`# Gmail Messages (${messages.length}${nextPageToken ? '+' : ''})`, ''];
          for (const m of messages) {
            lines.push(`## ${m.subject}`);
            lines.push(`- **From**: ${m.from}`);
            lines.push(`- **Date**: ${formatDate(m.date)}`);
            lines.push(`- **ID**: \`${m.id}\``);
            if (m.snippet) lines.push(`- **Preview**: ${m.snippet}`);
            lines.push('');
          }
          if (nextPageToken) lines.push(`*Use page_token="${nextPageToken}" for next page.*`);
          text = lines.join('\n');
        } else {
          text = JSON.stringify({ messages, next_page_token: nextPageToken, has_more: !!nextPageToken }, null, 2);
        }

        return {
          content: [{ type: 'text', text: truncateIfNeeded(text) }],
          structuredContent: { messages, next_page_token: nextPageToken, has_more: !!nextPageToken },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
