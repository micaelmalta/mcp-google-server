import { describe, it, expect, vi, beforeEach } from 'vitest';
import './_setup.js';
import { loadAuthTools, registeredTools, mockRevokeTokens } from './_setup.js';

describe('google_auth_revoke tool', () => {
  beforeEach(async () => {
    await loadAuthTools();
    vi.clearAllMocks();
  });

  it('calls revokeTokens and returns success message', async () => {
    const handler = registeredTools.get('google_auth_revoke')!;
    const result = (await handler({})) as { content: { type: string; text: string }[] };

    expect(mockRevokeTokens).toHaveBeenCalled();
    expect(result.content[0].text).toContain('Google credentials revoked');
    expect(result.content[0].text).toContain('google_auth_start');
  });
});
