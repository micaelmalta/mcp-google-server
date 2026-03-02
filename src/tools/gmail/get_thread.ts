import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getGmail } from './shared.js';
import { ResponseFormat } from '../../types.js';
import { handleGoogleError } from '../../utils/errors.js';
import { formatDate, truncateIfNeeded, extractEmailBody } from '../../utils/format.js';

export function registerGetThread(server: McpServer): void {
  server.registerTool(
    'google_gmail_get_thread',
    {
      title: 'Get a Full Gmail Thread',
      description: `Retrieves all messages in a Gmail thread (conversation).

Args:
  - thread_id: Thread ID from google_gmail_list_threads

Returns all messages in the thread with their headers and body text, ordered chronologically.`,
      inputSchema: z.object({
        thread_id: z.string().min(1).describe('Thread ID.'),
        response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ thread_id, response_format }) => {
      try {
        const gmail = getGmail();
        const res = await gmail.users.threads.get({ userId: 'me', id: thread_id, format: 'full' });

        const messages = (res.data.messages ?? []).map((data) => {
          const headers = (data.payload?.headers ?? []).reduce<Record<string, string>>((acc, h) => {
            if (h.name) acc[h.name.toLowerCase()] = h.value ?? '';
            return acc;
          }, {});
          return {
            id: data.id ?? '',
            from: headers['from'] ?? '',
            to: headers['to'] ?? '',
            subject: headers['subject'] ?? '(No subject)',
            date: headers['date'] ?? '',
            body: extractEmailBody(data.payload),
            label_ids: data.labelIds ?? [],
          };
        });

        let text: string;
        if (response_format === ResponseFormat.MARKDOWN) {
          const lines = [`# Thread (${messages.length} messages)`, ''];
          for (const [i, m] of messages.entries()) {
            lines.push(`## Message ${i + 1}: ${m.subject}`);
            lines.push(`**From:** ${m.from} | **Date:** ${formatDate(m.date)}`);
            lines.push('');
            lines.push(m.body || '(No text content)');
            lines.push('');
            lines.push('---');
            lines.push('');
          }
          text = lines.join('\n');
        } else {
          text = JSON.stringify({ thread_id, messages }, null, 2);
        }

        return {
          content: [{ type: 'text', text: truncateIfNeeded(text) }],
          structuredContent: { thread_id, messages },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
