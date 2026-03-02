import { vi } from 'vitest';

const _mocks = vi.hoisted(() => ({
  mockFilesList: vi.fn(),
  mockFilesGet: vi.fn(),
  mockFilesCreate: vi.fn(),
  mockFilesUpdate: vi.fn(),
  mockPermissionsCreate: vi.fn(),
  mockPermissionsList: vi.fn(),
}));

export const mockFilesList = _mocks.mockFilesList;
export const mockFilesGet = _mocks.mockFilesGet;
export const mockFilesCreate = _mocks.mockFilesCreate;
export const mockFilesUpdate = _mocks.mockFilesUpdate;
export const mockPermissionsCreate = _mocks.mockPermissionsCreate;
export const mockPermissionsList = _mocks.mockPermissionsList;

vi.mock('../../../auth/oauth.js', () => ({ requireAuth: () => ({}) }));

vi.mock('googleapis', () => ({
  google: {
    drive: () => ({
      files: {
        list: _mocks.mockFilesList,
        get: _mocks.mockFilesGet,
        create: _mocks.mockFilesCreate,
        update: _mocks.mockFilesUpdate,
      },
      permissions: {
        create: _mocks.mockPermissionsCreate,
        list: _mocks.mockPermissionsList,
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

export async function loadDriveTools(): Promise<void> {
  if (registeredTools.size > 0) return;
  const { registerDriveTools } = await import('../index.js');
  registerDriveTools(mockServer as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
}

export function makeDriveFile(overrides: Record<string, unknown> = {}) {
  return {
    id: 'file-1',
    name: 'Test File',
    mimeType: 'application/vnd.google-apps.document',
    size: '0',
    createdTime: '2026-01-01T00:00:00Z',
    modifiedTime: '2026-03-01T00:00:00Z',
    parents: [],
    webViewLink: 'https://drive.google.com/file/d/file-1/view',
    webContentLink: null,
    owners: [{ emailAddress: 'u@example.com', displayName: 'User' }],
    shared: false,
    trashed: false,
    ...overrides,
  };
}
