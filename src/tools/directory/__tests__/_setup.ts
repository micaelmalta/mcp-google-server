import { vi } from 'vitest';

const _mocks = vi.hoisted(() => ({
  mockSearchDirectoryPeople: vi.fn(),
  mockListDirectoryPeople: vi.fn(),
  mockConnectionsList: vi.fn(),
  mockSearchContacts: vi.fn(),
}));

export const mockSearchDirectoryPeople = _mocks.mockSearchDirectoryPeople;
export const mockListDirectoryPeople = _mocks.mockListDirectoryPeople;
export const mockConnectionsList = _mocks.mockConnectionsList;
export const mockSearchContacts = _mocks.mockSearchContacts;

vi.mock('googleapis', () => ({
  google: {
    people: () => ({
      people: {
        searchDirectoryPeople: _mocks.mockSearchDirectoryPeople,
        listDirectoryPeople: _mocks.mockListDirectoryPeople,
        searchContacts: _mocks.mockSearchContacts,
        connections: { list: _mocks.mockConnectionsList },
      },
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

export async function loadTools(): Promise<void> {
  if (registeredTools.size > 0) return;
  const { registerDirectoryTools } = await import('../index.js');
  registerDirectoryTools(mockServer as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
}

export function makePerson(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    resourceName: 'people/100',
    names: [{ displayName: 'Test User' }],
    emailAddresses: [{ value: 'test@example.com' }],
    phoneNumbers: [{ value: '+1-555-0000' }],
    organizations: [{ name: 'TestCo', title: 'Dev' }],
    photos: [{ url: 'https://photo.example.com/test.jpg' }],
    ...overrides,
  };
}
