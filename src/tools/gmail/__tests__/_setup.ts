import { vi } from 'vitest';

const _mocks = vi.hoisted(() => ({
  mockLabelsList: vi.fn(),
  mockMessagesList: vi.fn(),
  mockMessagesGet: vi.fn(),
  mockMessagesSend: vi.fn(),
  mockMessagesBatchModify: vi.fn(),
  mockThreadsList: vi.fn(),
  mockThreadsGet: vi.fn(),
}));

export const mockLabelsList = _mocks.mockLabelsList;
export const mockMessagesList = _mocks.mockMessagesList;
export const mockMessagesGet = _mocks.mockMessagesGet;
export const mockMessagesSend = _mocks.mockMessagesSend;
export const mockMessagesBatchModify = _mocks.mockMessagesBatchModify;
export const mockThreadsList = _mocks.mockThreadsList;
export const mockThreadsGet = _mocks.mockThreadsGet;

vi.mock('../../../auth/oauth.js', () => ({ requireAuth: () => ({}) }));

vi.mock('googleapis', () => ({
  google: {
    gmail: () => ({
      users: {
        labels: { list: _mocks.mockLabelsList },
        messages: {
          list: _mocks.mockMessagesList,
          get: _mocks.mockMessagesGet,
          send: _mocks.mockMessagesSend,
          batchModify: _mocks.mockMessagesBatchModify,
        },
        threads: {
          list: _mocks.mockThreadsList,
          get: _mocks.mockThreadsGet,
        },
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

export async function loadGmailTools(): Promise<void> {
  if (registeredTools.size > 0) return;
  const { registerGmailTools } = await import('../index.js');
  registerGmailTools(mockServer as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
}
