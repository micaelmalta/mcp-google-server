import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getCalendar } from './shared.js';
import { handleGoogleError } from '../../utils/errors.js';
import { formatDate } from '../../utils/format.js';

export function registerCreateEvent(server: McpServer): void {
  server.registerTool(
    'google_calendar_create_event',
    {
      title: 'Create a Google Calendar Event',
      description: `Creates a new event on a Google Calendar.

Args:
  - calendar_id: Calendar ID (default: 'primary')
  - summary: Event title (required)
  - start_time: Start datetime (ISO 8601, e.g., "2024-03-15T14:00:00-05:00") — required unless all_day
  - end_time: End datetime (ISO 8601) — required unless all_day
  - all_day_date: Date string for all-day events (YYYY-MM-DD, e.g., "2024-03-15")
  - description: Event description/notes
  - location: Event location
  - attendees: Comma-separated email addresses to invite
  - time_zone: IANA timezone (e.g., "America/New_York"). Defaults to UTC.

Returns:
  - event_id: ID of the created event
  - html_link: Link to the event in Google Calendar`,
      inputSchema: z.object({
        calendar_id: z.string().default('primary'),
        summary: z.string().min(1).describe('Event title.'),
        start_time: z.string().optional().describe('Start datetime (ISO 8601). Required for timed events.'),
        end_time: z.string().optional().describe('End datetime (ISO 8601). Required for timed events.'),
        all_day_date: z.string().optional().describe('Date for all-day event (YYYY-MM-DD).'),
        description: z.string().optional().describe('Event description.'),
        location: z.string().optional().describe('Event location.'),
        attendees: z.string().optional().describe('Comma-separated email addresses.'),
        time_zone: z.string().default('UTC').describe('IANA timezone (e.g., "America/New_York").'),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ calendar_id, summary, start_time, end_time, all_day_date, description, location, attendees, time_zone }) => {
      try {
        if (!all_day_date && (!start_time || !end_time)) {
          return {
            isError: true,
            content: [{ type: 'text', text: 'Error: Either all_day_date or both start_time and end_time are required.' }],
          };
        }

        const cal = getCalendar();
        const eventBody: Record<string, unknown> = { summary };

        if (all_day_date) {
          eventBody.start = { date: all_day_date };
          eventBody.end = { date: all_day_date };
        } else {
          eventBody.start = { dateTime: start_time, timeZone: time_zone };
          eventBody.end = { dateTime: end_time, timeZone: time_zone };
        }

        if (description) eventBody.description = description;
        if (location) eventBody.location = location;
        if (attendees) {
          eventBody.attendees = attendees.split(',').map((e) => ({ email: e.trim() }));
        }

        const res = await cal.events.insert({ calendarId: calendar_id, requestBody: eventBody });
        const created = res.data;

        return {
          content: [
            {
              type: 'text',
              text: `## Event Created\n\n**${created.summary}**\n- Start: ${formatDate(created.start?.dateTime ?? created.start?.date)}\n- End: ${formatDate(created.end?.dateTime ?? created.end?.date)}\n- [View in Calendar](${created.htmlLink})\n- **ID**: \`${created.id}\``,
            },
          ],
          structuredContent: { event_id: created.id, html_link: created.htmlLink, summary: created.summary },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
