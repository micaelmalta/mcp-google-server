import { vi } from 'vitest';

const _mocks = vi.hoisted(() => ({
  mockCalendarList: vi.fn(),
  mockEventsList: vi.fn(),
  mockEventsGet: vi.fn(),
  mockEventsInsert: vi.fn(),
  mockEventsPatch: vi.fn(),
  mockEventsDelete: vi.fn(),
  mockFreebusyQuery: vi.fn(),
}));

export const mockCalendarList = _mocks.mockCalendarList;
export const mockEventsList = _mocks.mockEventsList;
export const mockEventsGet = _mocks.mockEventsGet;
export const mockEventsInsert = _mocks.mockEventsInsert;
export const mockEventsPatch = _mocks.mockEventsPatch;
export const mockEventsDelete = _mocks.mockEventsDelete;
export const mockFreebusyQuery = _mocks.mockFreebusyQuery;

vi.mock('../../../auth/oauth.js', () => ({ requireAuth: () => ({}) }));

vi.mock('googleapis', () => ({
  google: {
    calendar: () => ({
      calendarList: { list: _mocks.mockCalendarList },
      events: {
        list: _mocks.mockEventsList,
        get: _mocks.mockEventsGet,
        insert: _mocks.mockEventsInsert,
        patch: _mocks.mockEventsPatch,
        delete: _mocks.mockEventsDelete,
      },
      freebusy: { query: _mocks.mockFreebusyQuery },
    }),
  },
}));

type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;
export const registeredTools = new Map<string, ToolHandler>();

const mockServer = {
  registerTool: (name: string, _opts: unknown, handler: ToolHandler) => {
    registeredTools.set(name, handler);
  },
} as unknown;

export async function loadCalendarTools(): Promise<void> {
  if (registeredTools.size > 0) return;
  const { registerCalendarTools } = await import('../index.js');
  registerCalendarTools(mockServer as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
}
