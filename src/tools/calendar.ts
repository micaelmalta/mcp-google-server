import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { google } from 'googleapis';
import { z } from 'zod';
import { requireAuth } from '../auth/oauth.js';
import { ResponseFormat } from '../types.js';
import { handleGoogleError } from '../utils/errors.js';
import { formatDate, truncateIfNeeded } from '../utils/format.js';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../constants.js';

function getCalendar() {
  const auth = requireAuth();
  return google.calendar({ version: 'v3', auth });
}

export function registerCalendarTools(server: McpServer): void {
  // ─── google_calendar_list_calendars ───────────────────────────────────────
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

  // ─── google_calendar_list_events ─────────────────────────────────────────
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
        const res = await cal.events.list({
          calendarId: calendar_id,
          timeMin: time_min ?? new Date().toISOString(),
          timeMax: time_max,
          q: query,
          maxResults: limit,
          pageToken: page_token,
          singleEvents: true,
          orderBy: 'startTime',
        });

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

  // ─── google_calendar_get_event ────────────────────────────────────────────
  server.registerTool(
    'google_calendar_get_event',
    {
      title: 'Get a Google Calendar Event',
      description: `Retrieves full details for a specific calendar event by its ID.

Args:
  - calendar_id: Calendar ID (use 'primary' for main calendar)
  - event_id: Event ID from google_calendar_list_events

Returns full event details including description, conference data, recurrence rules, and all attendees.`,
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
        const res = await cal.events.get({ calendarId: calendar_id, eventId: event_id });
        const e = res.data;

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

  // ─── google_calendar_create_event ─────────────────────────────────────────
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

  // ─── google_calendar_update_event ─────────────────────────────────────────
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

  // ─── google_calendar_delete_event ─────────────────────────────────────────
  server.registerTool(
    'google_calendar_decline_event',
    {
      title: 'Decline a Google Calendar Event',
      description: `Declines an event invitation (sets your response to "declined"). Use this when you are an attendee and want to decline without deleting the event for others.

Args:
  - calendar_id: Calendar ID (default: 'primary')
  - event_id: Event ID from google_calendar_list_events`,
      inputSchema: z.object({
        calendar_id: z.string().default('primary').describe("Calendar ID."),
        event_id: z.string().min(1).describe('Event ID to decline.'),
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
                text: 'Could not find your attendee entry on this event. You may be the organizer (use delete to cancel) or the event has no attendees.',
              },
            ],
          };
        }
        const updatedAttendees = attendees.map((a, i) => {
          const base = { email: a.email };
          if (i === selfIndex) {
            return { ...base, responseStatus: 'declined' as const };
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
              text: `Declined event **${e.summary ?? 'Untitled'}** (${formatDate(e.start?.dateTime ?? e.start?.date)}). The organizer has been notified.`,
            },
          ],
          structuredContent: { event_id, summary: e.summary, declined: true },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );

  // ─── google_calendar_approve_event ────────────────────────────────────────
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

  // ─── google_calendar_delete_event ─────────────────────────────────────────
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

  // ─── google_calendar_get_freebusy ─────────────────────────────────────────
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
