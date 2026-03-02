import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getCalendar } from './shared.js';
import { ResponseFormat } from '../../types.js';
import { handleGoogleError } from '../../utils/errors.js';
import { formatDate, truncateIfNeeded } from '../../utils/format.js';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../constants.js';

export function registerListEvents(server: McpServer): void {
  server.registerTool(
    'google_calendar_list_events',
    {
      title: 'List Google Calendar Events',
      description: `Lists events from a Google Calendar with optional date filters and search query.

Args:
  - calendar_id: Calendar ID (use 'primary' for main calendar, or an ID from google_calendar_list_calendars)
  - time_min: Start of time range (ISO 8601, e.g., "2024-01-01T00:00:00Z"). Defaults to now.
  - time_max: End of time range (ISO 8601, e.g., "2024-01-31T23:59:59Z")
  - query: Free-text search across event fields
  - limit: Max events to return (1-${MAX_PAGE_SIZE}, default: ${DEFAULT_PAGE_SIZE})
  - page_token: Token from previous call for pagination
  - response_format: 'markdown' or 'json'

Returns:
  - events[].id: Event ID (use with update/delete)
  - events[].summary: Event title
  - events[].start / end: Event start/end time
  - events[].location: Event location
  - events[].attendees: List of attendees with response status
  - events[].attachments: Attached files (e.g. Google Docs) with fileUrl and title
  - events[].html_link: Link to event in Google Calendar
  - next_page_token: Token for next page (if has_more is true)`,
      inputSchema: z.object({
        calendar_id: z.string().default('primary').describe("Calendar ID. Use 'primary' for the main calendar."),
        time_min: z.string().optional().describe('Start of time range (ISO 8601). Defaults to now.'),
        time_max: z.string().optional().describe('End of time range (ISO 8601).'),
        query: z.string().optional().describe('Free-text search string.'),
        limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE).describe('Max events to return.'),
        page_token: z.string().optional().describe('Pagination token from previous call.'),
        response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ calendar_id, time_min, time_max, query, limit, page_token, response_format }) => {
      try {
        const cal = getCalendar();
        const listParams = {
          calendarId: calendar_id,
          timeMin: time_min ?? new Date().toISOString(),
          timeMax: time_max,
          q: query,
          maxResults: limit,
          pageToken: page_token,
          singleEvents: true,
          orderBy: 'startTime' as const,
          supportsAttachments: true,
        };
        const res = await cal.events.list(listParams as Record<string, unknown>);

        const events = (res.data.items ?? []).map((e) => ({
          id: e.id ?? '',
          summary: e.summary ?? '(No title)',
          start: e.start?.dateTime ?? e.start?.date ?? '',
          end: e.end?.dateTime ?? e.end?.date ?? '',
          location: e.location ?? '',
          description: e.description ?? '',
          status: e.status ?? '',
          html_link: e.htmlLink ?? '',
          attendees: (e.attendees ?? []).map((a) => ({
            email: a.email ?? '',
            display_name: a.displayName ?? '',
            response_status: a.responseStatus ?? '',
          })),
          creator: e.creator?.email ?? '',
          organizer: e.organizer?.email ?? '',
          recurring_event_id: e.recurringEventId ?? null,
          attachments: (e.attachments ?? []).map((a) => ({
            fileUrl: a.fileUrl ?? '',
            title: a.title ?? '',
            mimeType: a.mimeType ?? '',
          })),
        }));

        const nextPageToken = res.data.nextPageToken ?? undefined;
        const hasMore = !!nextPageToken;

        let text: string;
        if (response_format === ResponseFormat.MARKDOWN) {
          const lines = [`# Events from calendar: ${calendar_id}`, `Found ${events.length} event(s)${hasMore ? ' (more available)' : ''}`, ''];
          for (const e of events) {
            lines.push(`## ${e.summary}`);
            lines.push(`- **Start**: ${formatDate(e.start)}`);
            lines.push(`- **End**: ${formatDate(e.end)}`);
            if (e.location) lines.push(`- **Location**: ${e.location}`);
            if (e.attachments.length) {
              lines.push(`- **Attachments**: ${e.attachments.map((a) => `[${a.title || 'Link'}](${a.fileUrl})`).join(', ')}`);
            }
            if (e.attendees.length) lines.push(`- **Attendees**: ${e.attendees.map((a) => a.email).join(', ')}`);
            lines.push(`- **ID**: \`${e.id}\``);
            lines.push('');
          }
          if (hasMore) lines.push(`*Use page_token="${nextPageToken}" for next page.*`);
          text = lines.join('\n');
        } else {
          text = JSON.stringify({ events, next_page_token: nextPageToken, has_more: hasMore }, null, 2);
        }

        return {
          content: [{ type: 'text', text: truncateIfNeeded(text) }],
          structuredContent: { events, next_page_token: nextPageToken, has_more: hasMore },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
