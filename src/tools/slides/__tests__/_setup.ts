import { vi } from 'vitest';

const _mocks = vi.hoisted(() => ({
  mockPresentationsCreate: vi.fn(),
  mockPresentationsGet: vi.fn(),
  mockPresentationsBatchUpdate: vi.fn(),
}));

export const mockPresentationsCreate = _mocks.mockPresentationsCreate;
export const mockPresentationsGet = _mocks.mockPresentationsGet;
export const mockPresentationsBatchUpdate = _mocks.mockPresentationsBatchUpdate;

vi.mock('../../../auth/oauth.js', () => ({ requireAuth: () => ({}) }));

vi.mock('googleapis', () => ({
  google: {
    slides: () => ({
      presentations: {
        create: _mocks.mockPresentationsCreate,
        get: _mocks.mockPresentationsGet,
        batchUpdate: _mocks.mockPresentationsBatchUpdate,
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

export async function loadSlidesTools(): Promise<void> {
  if (registeredTools.size > 0) return;
  const { registerSlidesTools } = await import('../index.js');
  registerSlidesTools(mockServer as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
}
