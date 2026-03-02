import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getGmail } from './shared.js';
import { ResponseFormat } from '../../types.js';
import { handleGoogleError } from '../../utils/errors.js';
import { formatDate, truncateIfNeeded, extractEmailBody } from '../../utils/format.js';

export function registerGetMessage(server: McpServer): void {
  server.registerTool(
    'google_gmail_get_message',
    {
      title: 'Get a Gmail Message',
      description: `Retrieves the full content of a Gmail message by its ID.

Args:
  - message_id: Message ID from google_gmail_list_messages or google_gmail_list_threads
  - response_format: 'markdown' or 'json'

Returns:
  - id, thread_id: Identifiers
  - from, to, cc, subject, date: Email headers
  - body: Full decoded message body (plain text)
  - label_ids: Gmail labels applied to message
  - attachments: List of attachment names (content not downloaded)`,
      inputSchema: z.object({
        message_id: z.string().min(1).describe('Message ID.'),
        response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ message_id, response_format }) => {
      try {
        const gmail = getGmail();
        const res = await gmail.users.messages.get({ userId: 'me', id: message_id, format: 'full' });
        const data = res.data;

        const headers = (data.payload?.headers ?? []).reduce<Record<string, string>>((acc, h) => {
          if (h.name) acc[h.name.toLowerCase()] = h.value ?? '';
          return acc;
        }, {});

        const attachments = (data.payload?.parts ?? [])
          .filter((p) => p.filename)
          .map((p) => ({ filename: p.filename ?? '', mime_type: p.mimeType ?? '' }));

        const message = {
          id: data.id ?? '',
          thread_id: data.threadId ?? '',
          from: headers['from'] ?? '',
          to: headers['to'] ?? '',
          cc: headers['cc'] ?? '',
          subject: headers['subject'] ?? '(No subject)',
          date: headers['date'] ?? '',
          body: extractEmailBody(data.payload),
          label_ids: data.labelIds ?? [],
          attachments,
        };

        let text: string;
        if (response_format === ResponseFormat.MARKDOWN) {
          const lines = [
            `# ${message.subject}`,
            '',
            `**From:** ${message.from}`,
            `**To:** ${message.to}`,
            message.cc ? `**Cc:** ${message.cc}` : '',
            `**Date:** ${formatDate(message.date)}`,
            `**Labels:** ${message.label_ids.join(', ')}`,
            '',
            '---',
            '',
            message.body || '(No text content)',
          ].filter((l) => l !== '');
          text = lines.join('\n');
        } else {
          text = JSON.stringify(message, null, 2);
        }

        return {
          content: [{ type: 'text', text: truncateIfNeeded(text) }],
          structuredContent: message,
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
