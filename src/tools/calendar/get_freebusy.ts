import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getCalendar } from './shared.js';
import { handleGoogleError } from '../../utils/errors.js';
import { formatDate } from '../../utils/format.js';

export function registerGetFreebusy(server: McpServer): void {
  server.registerTool(
    'google_calendar_get_freebusy',
    {
      title: 'Check Google Calendar Free/Busy',
      description: `Queries free/busy information for one or more calendars over a time range.

Useful for:
- Finding available meeting slots
- Checking if a room or person is available
- Scheduling automation

Args:
  - calendar_ids: Comma-separated calendar IDs or email addresses to check
  - time_min: Start of time range (ISO 8601, required)
  - time_max: End of time range (ISO 8601, required)
  - time_zone: IANA timezone for interpreting times (default: UTC)

Returns:
  - For each calendar: list of busy time ranges (start/end ISO timestamps)
  - Calendars with no busy periods are free for the entire range`,
      inputSchema: z.object({
        calendar_ids: z.string().min(1).describe('Comma-separated calendar IDs or email addresses.'),
        time_min: z.string().min(1).describe('Start of time range (ISO 8601).'),
        time_max: z.string().min(1).describe('End of time range (ISO 8601).'),
        time_zone: z.string().default('UTC'),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ calendar_ids, time_min, time_max, time_zone }) => {
      try {
        const cal = getCalendar();
        const ids = calendar_ids.split(',').map((id) => id.trim());

        const res = await cal.freebusy.query({
          requestBody: {
            timeMin: time_min,
            timeMax: time_max,
            timeZone: time_zone,
            items: ids.map((id) => ({ id })),
          },
        });

        const calendars = res.data.calendars ?? {};
        const result = Object.entries(calendars).map(([id, info]) => ({
          calendar_id: id,
          busy: (info.busy ?? []).map((b) => ({ start: b.start ?? '', end: b.end ?? '' })),
          errors: info.errors ?? [],
        }));

        const lines = [`# Free/Busy: ${time_min} → ${time_max}`, ''];
        for (const c of result) {
          lines.push(`## ${c.calendar_id}`);
          if (c.busy.length === 0) {
            lines.push('✓ Free for the entire period');
          } else {
            lines.push(`Busy ${c.busy.length} time(s):`);
            for (const b of c.busy) {
              lines.push(`  - ${formatDate(b.start)} → ${formatDate(b.end)}`);
            }
          }
          lines.push('');
        }

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
          structuredContent: { time_min, time_max, calendars: result },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
