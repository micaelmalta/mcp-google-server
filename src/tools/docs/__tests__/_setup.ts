import { vi } from 'vitest';

const _mocks = vi.hoisted(() => ({
  mockDocumentsGet: vi.fn(),
  mockDocumentsCreate: vi.fn(),
  mockDocumentsBatchUpdate: vi.fn(),
}));

export const mockDocumentsGet = _mocks.mockDocumentsGet;
export const mockDocumentsCreate = _mocks.mockDocumentsCreate;
export const mockDocumentsBatchUpdate = _mocks.mockDocumentsBatchUpdate;

vi.mock('../../../auth/oauth.js', () => ({ requireAuth: () => ({}) }));

vi.mock('googleapis', () => ({
  google: {
    docs: () => ({
      documents: {
        get: _mocks.mockDocumentsGet,
        create: _mocks.mockDocumentsCreate,
        batchUpdate: _mocks.mockDocumentsBatchUpdate,
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

export async function loadDocsTools(): Promise<void> {
  if (registeredTools.size > 0) return;
  const { registerDocsTools } = await import('../index.js');
  registerDocsTools(mockServer as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
}
