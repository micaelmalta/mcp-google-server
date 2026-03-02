import { vi } from 'vitest';

export const mockGetAuthUrl = vi.fn();
export const mockStartCallbackServer = vi.fn();
export const mockIsAuthenticated = vi.fn();
export const mockGetOAuthClient = vi.fn();
export const mockRevokeTokens = vi.fn();
export const mockHandleGoogleError = vi.fn((err: unknown) => (err instanceof Error ? err.message : String(err)));

vi.mock('../../../auth/oauth.js', () => ({
  getAuthUrl: (...args: unknown[]) => mockGetAuthUrl(...args),
  getOAuthClient: (...args: unknown[]) => mockGetOAuthClient(...args),
  isAuthenticated: () => mockIsAuthenticated(),
  revokeTokens: () => mockRevokeTokens(),
}));

vi.mock('../../../auth/callback.js', () => ({
  startCallbackServer: () => mockStartCallbackServer(),
}));

vi.mock('../../../constants.js', () => ({
  TOKENS_PATH: '/tmp/test-tokens.json',
  OAUTH_CALLBACK_PORT: 8080,
}));

vi.mock('../../../utils/errors.js', () => ({
  handleGoogleError: (err: unknown) => mockHandleGoogleError(err),
}));

type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;
export const registeredTools = new Map<string, ToolHandler>();

const mockServer = {
  registerTool: (name: string, _opts: unknown, handler: ToolHandler) => {
    registeredTools.set(name, handler);
  },
} as unknown;

export async function loadAuthTools(): Promise<void> {
  if (registeredTools.size > 0) return;
  const { registerAuthTools } = await import('../index.js');
  registerAuthTools(mockServer as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
}
