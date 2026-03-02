import { describe, it, expect, vi, beforeEach } from 'vitest';
import './_setup.js';
import { loadAuthTools, registeredTools, mockGetAuthUrl, mockStartCallbackServer } from './_setup.js';

describe('google_auth_start tool', () => {
  beforeEach(async () => {
    await loadAuthTools();
    vi.clearAllMocks();
  });

  it('returns auth URL and instructions on success', async () => {
    mockStartCallbackServer.mockResolvedValue(undefined);
    mockGetAuthUrl.mockReturnValue('https://accounts.google.com/authorize?client_id=test');

    const handler = registeredTools.get('google_auth_start')!;
    const result = (await handler({})) as { content: { type: string; text: string }[]; structuredContent: { auth_url: string } };

    expect(mockStartCallbackServer).toHaveBeenCalled();
    expect(mockGetAuthUrl).toHaveBeenCalled();
    expect(result.content[0].text).toContain('Open this URL in your browser');
    expect(result.content[0].text).toContain('https://accounts.google.com/authorize');
    expect(result.structuredContent.auth_url).toBe('https://accounts.google.com/authorize?client_id=test');
  });

  it('returns error when startCallbackServer throws', async () => {
    mockStartCallbackServer.mockRejectedValue(new Error('Port in use'));

    const handler = registeredTools.get('google_auth_start')!;
    const result = (await handler({})) as { isError: boolean; content: { type: string; text: string }[] };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Port in use');
  });
});
