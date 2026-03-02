import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerListCalendars } from './list_calendars.js';
import { registerListEvents } from './list_events.js';
import { registerGetEvent } from './get_event.js';
import { registerCreateEvent } from './create_event.js';
import { registerUpdateEvent } from './update_event.js';
import { registerDeclineEvent } from './decline_event.js';
import { registerApproveEvent } from './approve_event.js';
import { registerDeleteEvent } from './delete_event.js';
import { registerGetFreebusy } from './get_freebusy.js';

export function registerCalendarTools(server: McpServer): void {
  registerListCalendars(server);
  registerListEvents(server);
  registerGetEvent(server);
  registerCreateEvent(server);
  registerUpdateEvent(server);
  registerDeclineEvent(server);
  registerApproveEvent(server);
  registerDeleteEvent(server);
  registerGetFreebusy(server);
}
