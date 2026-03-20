import { OAuth2Client } from 'google-auth-library';
import type { Response } from 'express';
import type { OAuthServerProvider, AuthorizationParams } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { OAuthClientInformationFull, OAuthTokens, OAuthTokenRevocationRequest } from '@modelcontextprotocol/sdk/shared/auth.js';
import { OAuthTokensSchema } from '@modelcontextprotocol/sdk/shared/auth.js';

/**
 * OAuth 2.1 server provider that proxies to Google's OAuth endpoints.
 *
 * Google only allows http://localhost or https:// redirect URIs, but MCP clients
 * use custom schemes (e.g. cursor://). This provider works around the limitation
 * by using its own /oauth/callback as the redirect_uri with Google, then forwarding
 * the authorization code to the original client redirect URI.
 *
 * The full flow:
 *   1. Client discovers /.well-known/oauth-authorization-server
 *   2. Client POSTs to /register → gets back client_id/secret (our Google creds)
 *   3. Client redirects user to /authorize with redirect_uri=cursor://...
 *   4. We redirect to Google with redirect_uri=http://localhost:PORT/oauth/callback
 *   5. User signs in, Google redirects to our /oauth/callback with ?code=...&state=...
 *   6. We look up the original client redirect_uri and forward the code+state there
 *   7. Client POSTs code to /token → we exchange with Google using our callback URI
 *   8. Client receives Google access token, sends it as Bearer on /mcp requests
 */
/**
 * Allowed redirect URI schemes for MCP clients. Only known MCP client schemes
 * and localhost HTTP are permitted to prevent authorization code theft via
 * open redirect.
 */
const ALLOWED_REDIRECT_SCHEMES = new Set([
  'http:',     // localhost callbacks (validated below)
  'https:',    // standard web callbacks
  'cursor:',   // Cursor IDE
  'vscode:',   // VS Code
  'vscode-insiders:', // VS Code Insiders
]);

function isAllowedRedirectUri(uri: string): boolean {
  try {
    const url = new URL(uri);
    // http:// only allowed for localhost
    if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
      return false;
    }
    return ALLOWED_REDIRECT_SCHEMES.has(url.protocol);
  } catch {
    return false;
  }
}

export class GoogleOAuthProvider implements OAuthServerProvider {
  private readonly _googleClientId: string;
  private readonly _googleClientSecret: string;
  private readonly _clients = new Map<string, OAuthClientInformationFull>();
  private readonly _callbackUrl: string;

  // Maps state → { redirectUri, createdAt } for the callback proxy.
  // Entries expire after 10 minutes to prevent unbounded growth from abandoned flows.
  private static readonly REDIRECT_TTL_MS = 10 * 60 * 1000;
  private readonly _pendingRedirects = new Map<string, { redirectUri: string; createdAt: number }>();

  skipLocalPkceValidation = true;

  constructor(googleClientId: string, googleClientSecret: string, callbackUrl: string) {
    this._googleClientId = googleClientId;
    this._googleClientSecret = googleClientSecret;
    this._callbackUrl = callbackUrl;
  }

  private _cleanExpiredRedirects(): void {
    const now = Date.now();
    for (const [state, entry] of this._pendingRedirects) {
      if (now - entry.createdAt > GoogleOAuthProvider.REDIRECT_TTL_MS) {
        this._pendingRedirects.delete(state);
      }
    }
  }

  get clientsStore(): OAuthRegisteredClientsStore {
    return {
      getClient: async (clientId: string) => this._clients.get(clientId),
      registerClient: async (client: Omit<OAuthClientInformationFull, 'client_id' | 'client_id_issued_at'>) => {
        // Issue a proxy secret — never expose the real Google client_secret.
        // The proxy secret is used by the MCP client for client_secret_post auth
        // against our /token endpoint. We use the real secret internally when
        // proxying to Google.
        const proxySecret = crypto.randomUUID();
        const registered: OAuthClientInformationFull = {
          ...client,
          client_id: this._googleClientId,
          client_id_issued_at: Math.floor(Date.now() / 1000),
          client_secret: proxySecret,
        };
        this._clients.set(registered.client_id, registered);
        return registered;
      },
    };
  }

  async authorize(_client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    if (!isAllowedRedirectUri(params.redirectUri)) {
      res.status(400).json({ error: 'invalid_request', error_description: 'Disallowed redirect_uri scheme' });
      return;
    }
    this._cleanExpiredRedirects();
    const state = params.state ?? crypto.randomUUID();
    this._pendingRedirects.set(state, { redirectUri: params.redirectUri, createdAt: Date.now() });

    const targetUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    const searchParams = new URLSearchParams({
      client_id: this._googleClientId,
      response_type: 'code',
      redirect_uri: this._callbackUrl,  // Our server's callback, not the client's
      code_challenge: params.codeChallenge,
      code_challenge_method: 'S256',
      state,
      access_type: 'offline',
      prompt: 'consent',
    });
    if (params.scopes?.length) searchParams.set('scope', params.scopes.join(' '));
    targetUrl.search = searchParams.toString();
    res.redirect(targetUrl.toString());
  }

  /**
   * Handles Google's redirect to /oauth/callback.
   * Looks up the original client redirect_uri and forwards the code+state.
   */
  handleCallback(code: string, state: string, res: Response): void {
    const entry = this._pendingRedirects.get(state);
    if (!entry) {
      res.status(400).json({ error: 'invalid_state', description: 'Unknown or expired state parameter' });
      return;
    }
    this._pendingRedirects.delete(state);

    const redirectUrl = new URL(entry.redirectUri);
    redirectUrl.searchParams.set('code', code);
    redirectUrl.searchParams.set('state', state);
    res.redirect(redirectUrl.toString());
  }

  async challengeForAuthorizationCode(): Promise<string> {
    // Google handles PKCE validation, not us
    return '';
  }

  async exchangeAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string,
    codeVerifier?: string,
  ): Promise<OAuthTokens> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this._googleClientId,
      client_secret: this._googleClientSecret,  // Use real secret, not proxy
      code: authorizationCode,
      redirect_uri: this._callbackUrl,  // Must match what we sent to Google
    });
    if (codeVerifier) params.append('code_verifier', codeVerifier);

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Token exchange failed: ${response.status} ${err}`);
    }
    return OAuthTokensSchema.parse(await response.json());
  }

  async exchangeRefreshToken(
    _client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
  ): Promise<OAuthTokens> {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this._googleClientId,
      client_secret: this._googleClientSecret,  // Use real secret, not proxy
      refresh_token: refreshToken,
    });
    if (scopes?.length) params.set('scope', scopes.join(' '));

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Token refresh failed: ${response.status} ${err}`);
    }
    return OAuthTokensSchema.parse(await response.json());
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const client = new OAuth2Client();
    const tokenInfo = await client.getTokenInfo(token);
    if (!tokenInfo.expiry_date) throw new Error('Token has no expiry');

    // Verify the token was issued for this application, not a different OAuth client
    if (tokenInfo.aud !== this._googleClientId) {
      throw new Error('Token audience does not match this application');
    }

    return {
      token,
      clientId: tokenInfo.aud as string,
      scopes: (tokenInfo.scopes ?? []) as string[],
      expiresAt: Math.floor(tokenInfo.expiry_date / 1000),
    };
  }

  async revokeToken(_client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest): Promise<void> {
    const params = new URLSearchParams({ token: request.token });
    const response = await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    if (!response.ok) throw new Error(`Token revocation failed: ${response.status}`);
  }
}

/**
 * Returns an OAuth2Client configured with the given access token,
 * extracted from req.auth (set by requireBearerAuth middleware).
 */
export function clientFromBearerToken(accessToken: string, clientId: string, clientSecret: string): OAuth2Client {
  const client = new OAuth2Client({ clientId, clientSecret });
  client.setCredentials({ access_token: accessToken });
  return client;
}
