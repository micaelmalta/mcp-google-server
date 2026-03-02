import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getCalendar } from './shared.js';
import { handleGoogleError } from '../../utils/errors.js';

export function registerDeleteEvent(server: McpServer): void {
  server.registerTool(
    'google_calendar_delete_event',
    {
      title: 'Delete a Google Calendar Event',
      description: `Permanently deletes a calendar event. This action cannot be undone.

Args:
  - calendar_id: Calendar ID (default: 'primary')
  - event_id: Event ID to delete`,
      inputSchema: z.object({
        calendar_id: z.string().default('primary'),
        event_id: z.string().min(1).describe('Event ID to delete.'),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ calendar_id, event_id }) => {
      try {
        const cal = getCalendar();
        await cal.events.delete({ calendarId: calendar_id, eventId: event_id });

        return {
          content: [{ type: 'text', text: `Event \`${event_id}\` deleted successfully from calendar \`${calendar_id}\`.` }],
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
