import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';

const mockSetCredentials = vi.fn();
const mockGenerateAuthUrl = vi.fn().mockReturnValue('https://accounts.google.com/authorize?state=test');
let tokensCallback: ((tokens: { access_token?: string; refresh_token?: string }) => void) | null = null;
const mockOn = vi.fn((event: string, cb: (tokens: { access_token?: string; refresh_token?: string }) => void) => {
  if (event === 'tokens') tokensCallback = cb;
});
const mockGetToken = vi.fn().mockResolvedValue({ tokens: { access_token: 'at', refresh_token: 'rt' } });

const sharedCredentials: { access_token?: string; refresh_token?: string } = {};

vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: class MockOAuth2 {
        setCredentials = mockSetCredentials;
        get credentials() {
          return sharedCredentials;
        }
        generateAuthUrl = mockGenerateAuthUrl;
        getToken = mockGetToken;
        on = mockOn;
      },
    },
  },
}));

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(false),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
  },
}));

const originalEnv = process.env;

describe('oauth', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    tokensCallback = null;
    sharedCredentials.access_token = '';
    sharedCredentials.refresh_token = '';
    process.env = { ...originalEnv };
    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
    const { revokeTokens } = await import('../oauth.js');
    revokeTokens();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getAuthUrl', () => {
    it('returns auth URL from client', async () => {
      const { getAuthUrl } = await import('../oauth.js');
      expect(getAuthUrl()).toBe('https://accounts.google.com/authorize?state=test');
      expect(mockGenerateAuthUrl).toHaveBeenCalledWith(
        expect.objectContaining({ access_type: 'offline', prompt: 'consent' })
      );
    });
  });

  describe('isAuthenticated', () => {
    it('returns false when client has no credentials', async () => {
      const { isAuthenticated } = await import('../oauth.js');
      expect(isAuthenticated()).toBe(false);
    });

    it('returns true when client has access_token', async () => {
      sharedCredentials.access_token = 'at';
      const { isAuthenticated } = await import('../oauth.js');
      expect(isAuthenticated()).toBe(true);
    });

    it('returns false when getOAuthClient throws', async () => {
      delete process.env.GOOGLE_CLIENT_ID;
      vi.resetModules();
      const { isAuthenticated } = await import('../oauth.js');
      expect(isAuthenticated()).toBe(false);
    });
  });

  describe('requireAuth', () => {
    it('throws when no credentials', async () => {
      const { requireAuth } = await import('../oauth.js');
      expect(() => requireAuth()).toThrow('Not authenticated');
    });

    it('returns client when credentials present', async () => {
      sharedCredentials.access_token = 'at';
      const { requireAuth } = await import('../oauth.js');
      const client = requireAuth();
      expect(client).toBeDefined();
      expect(client.credentials).toEqual(sharedCredentials);
    });
  });

  describe('revokeTokens', () => {
    it('removes token file when it exists', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      const { revokeTokens: revoke } = await import('../oauth.js');
      revoke();
      expect(fs.unlinkSync).toHaveBeenCalled();
    });
  });

  describe('getOAuthClient', () => {
    it('persists tokens when client emits tokens event', async () => {
      vi.resetModules();
      const { getOAuthClient } = await import('../oauth.js');
      getOAuthClient();
      expect(tokensCallback).not.toBeNull();
      tokensCallback!({ access_token: 'refreshed_at' });
      expect(fs.writeFileSync).toHaveBeenCalled();
      const written = vi.mocked(fs.writeFileSync).mock.calls[0]?.[1] as string;
      expect(written).toContain('refreshed_at');
    });

    it('throws when GOOGLE_CLIENT_ID is missing', async () => {
      delete process.env.GOOGLE_CLIENT_ID;
      vi.resetModules();
      const { getOAuthClient } = await import('../oauth.js');
      expect(() => getOAuthClient()).toThrow(
        'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET'
      );
    });

    it('loads saved tokens from disk when TOKENS_PATH exists', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ access_token: 'saved_at', refresh_token: 'saved_rt' })
      );
      const { getOAuthClient } = await import('../oauth.js');
      getOAuthClient();
      expect(mockSetCredentials).toHaveBeenCalledWith(
        expect.objectContaining({ access_token: 'saved_at', refresh_token: 'saved_rt' })
      );
    });

    it('continues when token file exists but is invalid JSON', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Invalid JSON');
      });
      const { getOAuthClient } = await import('../oauth.js');
      expect(() => getOAuthClient()).not.toThrow();
    });
  });

  describe('exchangeCode', () => {
    it('calls getToken and saveTokens', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const { exchangeCode } = await import('../oauth.js');
      await exchangeCode('auth-code-123');
      expect(mockGetToken).toHaveBeenCalledWith('auth-code-123');
      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(mockSetCredentials).toHaveBeenCalled();
    });
  });

  describe('saveTokens', () => {
    it('merges with existing tokens when file exists', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({ refresh_token: 'existing_rt' })
      );
      const { saveTokens } = await import('../oauth.js');
      saveTokens({ access_token: 'new_at' });
      const written = vi.mocked(fs.writeFileSync).mock.calls[0]?.[1] as string;
      expect(written).toContain('new_at');
      expect(written).toContain('existing_rt');
    });
  });
});
