import { vi } from 'vitest';

const _mocks = vi.hoisted(() => ({
  mockValuesGet: vi.fn(),
  mockSpreadsheetsCreate: vi.fn(),
  mockBatchUpdate: vi.fn(),
  mockSpreadsheetsGet: vi.fn(),
  mockValuesUpdate: vi.fn(),
  mockValuesAppend: vi.fn(),
}));

export const mockValuesGet = _mocks.mockValuesGet;
export const mockSpreadsheetsCreate = _mocks.mockSpreadsheetsCreate;
export const mockBatchUpdate = _mocks.mockBatchUpdate;
export const mockSpreadsheetsGet = _mocks.mockSpreadsheetsGet;
export const mockValuesUpdate = _mocks.mockValuesUpdate;
export const mockValuesAppend = _mocks.mockValuesAppend;

vi.mock('../../../auth/oauth.js', () => ({ requireAuth: () => ({}) }));

vi.mock('googleapis', () => ({
  google: {
    sheets: () => ({
      spreadsheets: {
        values: {
          get: _mocks.mockValuesGet,
          update: _mocks.mockValuesUpdate,
          append: _mocks.mockValuesAppend,
        },
        create: _mocks.mockSpreadsheetsCreate,
        batchUpdate: _mocks.mockBatchUpdate,
        get: _mocks.mockSpreadsheetsGet,
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

export async function loadSheetsTools(): Promise<void> {
  if (registeredTools.size > 0) return;
  const { registerSheetsTools } = await import('../index.js');
  registerSheetsTools(mockServer as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
}
