import { describe, it, expect, vi, beforeEach } from 'vitest';
import './_setup.js';
import {
  loadAuthTools,
  registeredTools,
  mockIsAuthenticated,
  mockGetOAuthClient,
} from './_setup.js';

describe('google_auth_status tool', () => {
  beforeEach(async () => {
    await loadAuthTools();
    vi.clearAllMocks();
  });

  it('returns authenticated status when credentials present', async () => {
    mockIsAuthenticated.mockReturnValue(true);
    mockGetOAuthClient.mockReturnValue({
      credentials: {
        refresh_token: 'rt',
        expiry_date: Date.now() + 3600000,
      },
    });

    const handler = registeredTools.get('google_auth_status')!;
    const result = (await handler({})) as {
      content: { type: string; text: string }[];
      structuredContent: { authenticated: boolean; has_refresh_token: boolean; tokens_path: string };
    };

    expect(result.content[0].text).toContain('Authenticated');
    expect(result.structuredContent.authenticated).toBe(true);
    expect(result.structuredContent.has_refresh_token).toBe(true);
    expect(result.structuredContent.tokens_path).toBe('/tmp/test-tokens.json');
  });

  it('returns not authenticated when no credentials', async () => {
    mockIsAuthenticated.mockReturnValue(false);
    mockGetOAuthClient.mockReturnValue(null);

    const handler = registeredTools.get('google_auth_status')!;
    const result = (await handler({})) as {
      content: { type: string; text: string }[];
      structuredContent: { authenticated: boolean };
    };

    expect(result.content[0].text).toContain('Not Authenticated');
    expect(result.structuredContent.authenticated).toBe(false);
  });

  it('returns error on throw', async () => {
    mockIsAuthenticated.mockImplementation(() => {
      throw new Error('Token file corrupt');
    });

    const handler = registeredTools.get('google_auth_status')!;
    const result = (await handler({})) as { isError: boolean; content: { type: string; text: string }[] };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Token file corrupt');
  });
});
