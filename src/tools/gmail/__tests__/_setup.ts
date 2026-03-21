import { vi } from 'vitest';

const _mocks = vi.hoisted(() => ({
  mockLabelsList: vi.fn(),
  mockMessagesList: vi.fn(),
  mockMessagesGet: vi.fn(),
  mockMessagesSend: vi.fn(),
  mockMessagesBatchModify: vi.fn(),
  mockThreadsList: vi.fn(),
  mockThreadsGet: vi.fn(),
  mockDraftsList: vi.fn(),
  mockDraftsGet: vi.fn(),
  mockDraftsCreate: vi.fn(),
  mockDraftsUpdate: vi.fn(),
  mockDraftsDelete: vi.fn(),
  mockDraftsSend: vi.fn(),
  mockExecSync: vi.fn(),
  mockExecFileSync: vi.fn(),
  mockUsersGetProfile: vi.fn(),
  mockSettingsFiltersList: vi.fn(),
  mockSettingsFiltersGet: vi.fn(),
  mockSettingsFiltersCreate: vi.fn(),
  mockSettingsFiltersDelete: vi.fn(),
}));

export const mockLabelsList = _mocks.mockLabelsList;
export const mockMessagesList = _mocks.mockMessagesList;
export const mockMessagesGet = _mocks.mockMessagesGet;
export const mockMessagesSend = _mocks.mockMessagesSend;
export const mockMessagesBatchModify = _mocks.mockMessagesBatchModify;
export const mockThreadsList = _mocks.mockThreadsList;
export const mockThreadsGet = _mocks.mockThreadsGet;
export const mockDraftsList = _mocks.mockDraftsList;
export const mockDraftsGet = _mocks.mockDraftsGet;
export const mockDraftsCreate = _mocks.mockDraftsCreate;
export const mockDraftsUpdate = _mocks.mockDraftsUpdate;
export const mockDraftsDelete = _mocks.mockDraftsDelete;
export const mockDraftsSend = _mocks.mockDraftsSend;
export const mockExecSync = _mocks.mockExecSync;
export const mockExecFileSync = _mocks.mockExecFileSync;
export const mockUsersGetProfile = _mocks.mockUsersGetProfile;
export const mockSettingsFiltersList = _mocks.mockSettingsFiltersList;
export const mockSettingsFiltersGet = _mocks.mockSettingsFiltersGet;
export const mockSettingsFiltersCreate = _mocks.mockSettingsFiltersCreate;
export const mockSettingsFiltersDelete = _mocks.mockSettingsFiltersDelete;

vi.mock('../../../auth/oauth.js', () => ({ requireAuth: () => ({}) }));

vi.mock('googleapis', () => ({
  google: {
    gmail: () => ({
      users: {
        getProfile: _mocks.mockUsersGetProfile,
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
        drafts: {
          list: _mocks.mockDraftsList,
          get: _mocks.mockDraftsGet,
          create: _mocks.mockDraftsCreate,
          update: _mocks.mockDraftsUpdate,
          delete: _mocks.mockDraftsDelete,
          send: _mocks.mockDraftsSend,
        },
        settings: {
          filters: {
            list:   _mocks.mockSettingsFiltersList,
            get:    _mocks.mockSettingsFiltersGet,
            create: _mocks.mockSettingsFiltersCreate,
            delete: _mocks.mockSettingsFiltersDelete,
          },
        },
      },
    }),
  },
}));

vi.mock('child_process', () => ({
  execSync: _mocks.mockExecSync,
  execFileSync: _mocks.mockExecFileSync,
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
