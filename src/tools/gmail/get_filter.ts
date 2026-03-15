import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getGmail, formatFilter } from './shared.js';
import { ResponseFormat } from '../../types.js';
import { handleGoogleError } from '../../utils/errors.js';

export function registerGetFilter(server: McpServer): void {
  server.registerTool(
    'google_gmail_get_filter',
    {
      title: 'Get Gmail Filter',
      description: `Retrieves full details for a specific Gmail filter by its ID.

Args:
  - filter_id: Filter ID from google_gmail_list_filters

Returns:
  - filter.id: Filter ID
  - filter.criteria: Match conditions (from, to, subject, query)
  - filter.action.addLabelIds: Labels applied when filter matches
  - filter.action.removeLabelIds: Labels removed when filter matches`,
      inputSchema: z.object({
        filter_id:       z.string().min(1).describe('Filter ID to retrieve.'),
        response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ filter_id, response_format }) => {
      try {
        const gmail = getGmail();
        const res = await gmail.users.settings.filters.get({ userId: 'me', id: filter_id });
        const filter = formatFilter(res.data);

        let text: string;
        if (response_format === ResponseFormat.MARKDOWN) {
          const lines = [`# Filter \`${filter.id}\``, '', '**Criteria:**'];
          if (filter.criteria.from)    lines.push(`- From: ${filter.criteria.from}`);
          if (filter.criteria.to)      lines.push(`- To: ${filter.criteria.to}`);
          if (filter.criteria.subject) lines.push(`- Subject: ${filter.criteria.subject}`);
          if (filter.criteria.query)   lines.push(`- Query: ${filter.criteria.query}`);
          lines.push('', '**Action:**');
          if (filter.action.addLabelIds.length)    lines.push(`- Add labels: ${filter.action.addLabelIds.join(', ')}`);
          if (filter.action.removeLabelIds.length) lines.push(`- Remove labels: ${filter.action.removeLabelIds.join(', ')}`);
          text = lines.join('\n');
        } else {
          text = JSON.stringify({ filter }, null, 2);
        }

        return {
          content: [{ type: 'text', text }],
          structuredContent: { filter },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
