import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getCalendar } from './shared.js';
import { ResponseFormat } from '../../types.js';
import { handleGoogleError } from '../../utils/errors.js';
import { formatDate } from '../../utils/format.js';

export function registerGetEvent(server: McpServer): void {
  server.registerTool(
    'google_calendar_get_event',
    {
      title: 'Get a Google Calendar Event',
      description: `Retrieves full details for a specific calendar event by its ID.

Args:
  - calendar_id: Calendar ID (use 'primary' for main calendar)
  - event_id: Event ID from google_calendar_list_events

Returns full event details including description, conference data, recurrence rules, attendees, and any attached files (e.g. Google Docs).`,
      inputSchema: z.object({
        calendar_id: z.string().default('primary').describe("Calendar ID."),
        event_id: z.string().min(1).describe('Event ID.'),
        response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ calendar_id, event_id, response_format }) => {
      try {
        const cal = getCalendar();
        const getParams = {
          calendarId: calendar_id,
          eventId: event_id,
          supportsAttachments: true,
        };
        const res = await cal.events.get(getParams as Record<string, unknown>);
        const e = res.data;

        const attachments = (e.attachments ?? []).map((a) => ({
          fileUrl: a.fileUrl ?? '',
          title: a.title ?? '',
          mimeType: a.mimeType ?? '',
          fileId: a.fileId ?? undefined,
          iconLink: a.iconLink ?? undefined,
        }));

        const event = {
          id: e.id ?? '',
          summary: e.summary ?? '(No title)',
          description: e.description ?? '',
          start: e.start?.dateTime ?? e.start?.date ?? '',
          end: e.end?.dateTime ?? e.end?.date ?? '',
          location: e.location ?? '',
          status: e.status ?? '',
          html_link: e.htmlLink ?? '',
          creator: { email: e.creator?.email ?? '', name: e.creator?.displayName ?? '' },
          organizer: { email: e.organizer?.email ?? '', name: e.organizer?.displayName ?? '' },
          attendees: (e.attendees ?? []).map((a) => ({
            email: a.email ?? '',
            name: a.displayName ?? '',
            response_status: a.responseStatus ?? '',
            optional: a.optional ?? false,
          })),
          conference_data: e.conferenceData ?? null,
          recurrence: e.recurrence ?? [],
          attachments,
        };

        let text: string;
        if (response_format === ResponseFormat.MARKDOWN) {
          const lines = [
            `# ${event.summary}`,
            '',
            `- **Start**: ${formatDate(event.start)}`,
            `- **End**: ${formatDate(event.end)}`,
          ];
          if (event.location) lines.push(`- **Location**: ${event.location}`);
          if (event.description) lines.push(`\n**Description:** ${event.description}`);
          if (event.attachments.length) {
            lines.push('\n**Attachments:**');
            for (const a of event.attachments) {
              const label = a.title || a.fileUrl || 'Attachment';
              lines.push(`  - [${label}](${a.fileUrl})`);
            }
          }
          if (event.attendees.length) {
            lines.push('\n**Attendees:**');
            for (const a of event.attendees) {
              lines.push(`  - ${a.name || a.email} (${a.response_status})`);
            }
          }
          text = lines.join('\n');
        } else {
          text = JSON.stringify(event, null, 2);
        }

        return {
          content: [{ type: 'text', text }],
          structuredContent: event,
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
