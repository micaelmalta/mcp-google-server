import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getCalendar } from './shared.js';
import { handleGoogleError } from '../../utils/errors.js';
import { formatDate } from '../../utils/format.js';

export function registerUpdateEvent(server: McpServer): void {
  server.registerTool(
    'google_calendar_update_event',
    {
      title: 'Update a Google Calendar Event',
      description: `Updates an existing calendar event. Only fields you provide will be changed (patch semantics).

Args:
  - calendar_id: Calendar ID (default: 'primary')
  - event_id: Event ID from google_calendar_list_events or google_calendar_create_event
  - summary: New event title
  - start_time: New start datetime (ISO 8601)
  - end_time: New end datetime (ISO 8601)
  - description: New description
  - location: New location
  - attendees: New comma-separated email list (replaces existing)
  - add_attendees: Comma-separated emails to add (e.g. room resource); merged with existing attendees
  - add_meet_link: If true, adds a Google Meet video conference link to the event
  - time_zone: IANA timezone for the updated times`,
      inputSchema: z.object({
        calendar_id: z.string().default('primary'),
        event_id: z.string().min(1).describe('Event ID to update.'),
        summary: z.string().optional(),
        start_time: z.string().optional(),
        end_time: z.string().optional(),
        description: z.string().optional(),
        location: z.string().optional(),
        attendees: z.string().optional().describe('Comma-separated emails (replaces existing attendees).'),
        add_attendees: z.string().optional().describe('Comma-separated emails to add (e.g. room resource).'),
        add_meet_link: z.boolean().optional().describe('Add a Google Meet video conference link.'),
        time_zone: z.string().optional(),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ calendar_id, event_id, summary, start_time, end_time, description, location, attendees, add_attendees, add_meet_link, time_zone }) => {
      try {
        const cal = getCalendar();
        const patch: Record<string, unknown> = {};

        if (summary) patch.summary = summary;
        if (description !== undefined) patch.description = description;
        if (location !== undefined) patch.location = location;
        if (start_time) patch.start = { dateTime: start_time, timeZone: time_zone ?? 'UTC' };
        if (end_time) patch.end = { dateTime: end_time, timeZone: time_zone ?? 'UTC' };

        if (add_attendees != null && add_attendees !== '') {
          const existing = await cal.events.get({ calendarId: calendar_id, eventId: event_id });
          const existingAttendees = (existing.data.attendees ?? []).map((a) => ({ email: a.email }));
          const toAdd = add_attendees.split(',').map((e) => ({ email: e.trim() })).filter((a) => a.email);
          const combined = [...existingAttendees];
          for (const a of toAdd) {
            if (!combined.some((e) => (e as { email?: string }).email === a.email)) combined.push(a);
          }
          patch.attendees = combined;
        } else if (attendees) {
          patch.attendees = attendees.split(',').map((e) => ({ email: e.trim() }));
        }

        if (add_meet_link) {
          patch.conferenceData = {
            createRequest: {
              requestId: `${event_id}-${Date.now()}`,
              conferenceSolutionKey: { type: 'hangoutsMeet' },
            },
          };
        }

        const patchParams: { calendarId: string; eventId: string; requestBody: Record<string, unknown> } = {
          calendarId: calendar_id,
          eventId: event_id,
          requestBody: patch,
        };
        if (add_meet_link) (patchParams as Record<string, unknown>).conferenceDataVersion = 1;

        const res = await cal.events.patch(patchParams);
        const updated = res.data;
        const meetLink = updated.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === 'video');

        let text = `## Event Updated\n\n**${updated.summary}**\n- Start: ${formatDate(updated.start?.dateTime ?? updated.start?.date)}\n`;
        if (meetLink?.uri) {
          text += `- **Meet**: ${meetLink.uri}\n`;
        }
        text += `- [View in Calendar](${updated.htmlLink})`;

        return {
          content: [{ type: 'text', text }],
          structuredContent: {
            event_id: updated.id,
            html_link: updated.htmlLink,
            meet_link: meetLink?.uri,
          },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
