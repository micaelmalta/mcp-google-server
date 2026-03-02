import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getCalendar } from './shared.js';
import { handleGoogleError } from '../../utils/errors.js';
import { formatDate } from '../../utils/format.js';

export function registerApproveEvent(server: McpServer): void {
  server.registerTool(
    'google_calendar_approve_event',
    {
      title: 'Accept a Google Calendar Event',
      description: `Accepts an event invitation (sets your response to "accepted"). Use this when you are an attendee and want to accept without modifying other event details.

Args:
  - calendar_id: Calendar ID (default: 'primary')
  - event_id: Event ID from google_calendar_list_events`,
      inputSchema: z.object({
        calendar_id: z.string().default('primary').describe("Calendar ID."),
        event_id: z.string().min(1).describe('Event ID to accept.'),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ calendar_id, event_id }) => {
      try {
        const cal = getCalendar();
        const res = await cal.events.get({
          calendarId: calendar_id,
          eventId: event_id,
          maxAttendees: 250,
        });
        const e = res.data;
        const attendees = e.attendees ?? [];
        const selfIndex = attendees.findIndex((a) => (a as { self?: boolean }).self === true);
        if (selfIndex === -1) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: 'Could not find your attendee entry on this event. You may be the organizer or the event has no attendees.',
              },
            ],
          };
        }
        const updatedAttendees = attendees.map((a, i) => {
          const base = { email: a.email };
          if (i === selfIndex) {
            return { ...base, responseStatus: 'accepted' as const };
          }
          if (a.responseStatus) return { ...base, responseStatus: a.responseStatus };
          return base;
        });

        await cal.events.patch({
          calendarId: calendar_id,
          eventId: event_id,
          requestBody: { attendees: updatedAttendees },
          sendUpdates: 'all',
        });

        return {
          content: [
            {
              type: 'text',
              text: `Accepted event **${e.summary ?? 'Untitled'}** (${formatDate(e.start?.dateTime ?? e.start?.date)}). The organizer has been notified.`,
            },
          ],
          structuredContent: { event_id, summary: e.summary, accepted: true },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
