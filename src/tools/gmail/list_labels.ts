import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getGmail } from './shared.js';
import { ResponseFormat } from '../../types.js';
import { handleGoogleError } from '../../utils/errors.js';

export function registerListLabels(server: McpServer): void {
  server.registerTool(
    'google_gmail_list_labels',
    {
      title: 'List Gmail Labels',
      description: `Lists all Gmail labels including system labels (INBOX, SENT, etc.) and user-created labels.

Use the label IDs returned here with google_gmail_modify_labels and google_gmail_list_messages.

Returns:
  - labels[].id: Label ID to use in other tools
  - labels[].name: Display name
  - labels[].type: 'system' or 'user'
  - labels[].messages_total / messages_unread: Message counts`,
      inputSchema: z.object({
        response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ response_format }) => {
      try {
        const gmail = getGmail();
        const res = await gmail.users.labels.list({ userId: 'me' });

        const labels = (res.data.labels ?? []).map((l) => ({
          id: l.id ?? '',
          name: l.name ?? '',
          type: l.type ?? '',
          messages_total: l.messagesTotal ?? 0,
          messages_unread: l.messagesUnread ?? 0,
        }));

        let text: string;
        if (response_format === ResponseFormat.MARKDOWN) {
          const system = labels.filter((l) => l.type === 'system');
          const user = labels.filter((l) => l.type === 'user');

          const lines = ['# Gmail Labels', '', '## System Labels'];
          for (const l of system) {
            lines.push(`- **${l.name}** (\`${l.id}\`) — ${l.messages_unread} unread`);
          }
          if (user.length) {
            lines.push('', '## Custom Labels');
            for (const l of user) {
              lines.push(`- **${l.name}** (\`${l.id}\`) — ${l.messages_unread} unread`);
            }
          }
          text = lines.join('\n');
        } else {
          text = JSON.stringify({ labels }, null, 2);
        }

        return {
          content: [{ type: 'text', text }],
          structuredContent: { labels },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
