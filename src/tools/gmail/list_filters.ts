import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getGmail, formatFilter } from './shared.js';
import { ResponseFormat } from '../../types.js';
import { handleGoogleError } from '../../utils/errors.js';

export function registerListFilters(server: McpServer): void {
  server.registerTool(
    'google_gmail_list_filters',
    {
      title: 'List Gmail Filters',
      description: `Lists all Gmail filters for the authenticated user. Filters automatically apply actions to incoming mail matching specified criteria.

Returns:
  - filters[].id: Filter ID (use with get/delete/update filter tools)
  - filters[].criteria: Match conditions (from, to, subject, query)
  - filters[].action.addLabelIds: Labels applied when filter matches
  - filters[].action.removeLabelIds: Labels removed when filter matches`,
      inputSchema: z.object({
        response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ response_format }) => {
      try {
        const gmail = getGmail();
        const res = await gmail.users.settings.filters.list({ userId: 'me' });
        const filters = (res.data.filter ?? []).map(formatFilter);

        let text: string;
        if (response_format === ResponseFormat.MARKDOWN) {
          if (filters.length === 0) {
            text = '# Gmail Filters\n\nNo filters found.';
          } else {
            const lines = ['# Gmail Filters', ''];
            for (const f of filters) {
              lines.push(`## Filter \`${f.id}\``);
              lines.push('**Criteria:**');
              if (f.criteria.from)    lines.push(`- From: ${f.criteria.from}`);
              if (f.criteria.to)      lines.push(`- To: ${f.criteria.to}`);
              if (f.criteria.subject) lines.push(`- Subject: ${f.criteria.subject}`);
              if (f.criteria.query)   lines.push(`- Query: ${f.criteria.query}`);
              lines.push('**Action:**');
              if (f.action.addLabelIds.length)    lines.push(`- Add labels: ${f.action.addLabelIds.join(', ')}`);
              if (f.action.removeLabelIds.length) lines.push(`- Remove labels: ${f.action.removeLabelIds.join(', ')}`);
              lines.push('');
            }
            text = lines.join('\n');
          }
        } else {
          text = JSON.stringify({ filters }, null, 2);
        }

        return {
          content: [{ type: 'text', text }],
          structuredContent: { filters },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
