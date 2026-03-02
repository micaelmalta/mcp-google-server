import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getCalendar } from './shared.js';
import { ResponseFormat } from '../../types.js';
import { handleGoogleError } from '../../utils/errors.js';
import { truncateIfNeeded } from '../../utils/format.js';

export function registerListCalendars(server: McpServer): void {
  server.registerTool(
    'google_calendar_list_calendars',
    {
      title: 'List Google Calendars',
      description: `Lists all calendars in the authenticated user's calendar list.

Returns each calendar's ID (required for other calendar tools), display name, and access role.

Returns:
  - calendars[].id (string): Calendar ID to use in other tools (e.g., "primary" or email address)
  - calendars[].summary (string): Display name of the calendar
  - calendars[].description (string): Calendar description
  - calendars[].primary (boolean): Whether this is the primary calendar
  - calendars[].access_role (string): Access level (owner, writer, reader, freeBusyReader)`,
      inputSchema: z.object({
        response_format: z
          .nativeEnum(ResponseFormat)
          .default(ResponseFormat.MARKDOWN)
          .describe("Output format: 'markdown' or 'json'"),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ response_format }) => {
      try {
        const cal = getCalendar();
        const res = await cal.calendarList.list({ maxResults: 250 });
        const items = res.data.items ?? [];

        const calendars = items.map((c) => ({
          id: c.id ?? '',
          summary: c.summary ?? '',
          description: c.description ?? '',
          primary: c.primary ?? false,
          access_role: c.accessRole ?? '',
        }));

        let text: string;
        if (response_format === ResponseFormat.MARKDOWN) {
          const lines = [`# Your Calendars (${calendars.length})`, ''];
          for (const c of calendars) {
            lines.push(`## ${c.summary}${c.primary ? ' (Primary)' : ''}`);
            lines.push(`- **ID**: \`${c.id}\``);
            lines.push(`- **Access**: ${c.access_role}`);
            if (c.description) lines.push(`- **Description**: ${c.description}`);
            lines.push('');
          }
          text = lines.join('\n');
        } else {
          text = JSON.stringify({ calendars }, null, 2);
        }

        return {
          content: [{ type: 'text', text: truncateIfNeeded(text) }],
          structuredContent: { calendars },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
