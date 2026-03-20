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
 * The full flow:
 *   1. Client discovers /.well-known/oauth-authorization-server
 *   2. Client POSTs to /register → gets back client_id/secret (our Google creds)
 *   3. Client redirects user to /authorize → we proxy to accounts.google.com
 *   4. User signs in with Google, Google redirects back to client's redirect_uri
 *   5. Client POSTs code to /token → we proxy to oauth2.googleapis.com/token
 *   6. Client receives Google access token, sends it as Bearer on /mcp requests
 *   7. requireBearerAuth validates via Google tokeninfo API
 */
export class GoogleOAuthProvider implements OAuthServerProvider {
  private readonly _googleClientId: string;
  private readonly _googleClientSecret: string;
  private readonly _clients = new Map<string, OAuthClientInformationFull>();

  skipLocalPkceValidation = true;

  constructor(googleClientId: string, googleClientSecret: string) {
    this._googleClientId = googleClientId;
    this._googleClientSecret = googleClientSecret;
  }

  get clientsStore(): OAuthRegisteredClientsStore {
    return {
      getClient: async (clientId: string) => this._clients.get(clientId),
      registerClient: async (client: Omit<OAuthClientInformationFull, 'client_id' | 'client_id_issued_at'>) => {
        const registered: OAuthClientInformationFull = {
          ...client,
          client_id: this._googleClientId,
          client_id_issued_at: Math.floor(Date.now() / 1000),
          client_secret: this._googleClientSecret,
        };
        this._clients.set(registered.client_id, registered);
        return registered;
      },
    };
  }

  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    const targetUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    const searchParams = new URLSearchParams({
      client_id: client.client_id,
      response_type: 'code',
      redirect_uri: params.redirectUri,
      code_challenge: params.codeChallenge,
      code_challenge_method: 'S256',
      access_type: 'offline',
      prompt: 'consent',
    });
    if (params.state) searchParams.set('state', params.state);
    if (params.scopes?.length) searchParams.set('scope', params.scopes.join(' '));
    targetUrl.search = searchParams.toString();
    res.redirect(targetUrl.toString());
  }

  async challengeForAuthorizationCode(): Promise<string> {
    // Google handles PKCE validation, not us
    return '';
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    codeVerifier?: string,
    redirectUri?: string,
  ): Promise<OAuthTokens> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: client.client_id,
      code: authorizationCode,
    });
    if (client.client_secret) params.append('client_secret', client.client_secret);
    if (codeVerifier) params.append('code_verifier', codeVerifier);
    if (redirectUri) params.append('redirect_uri', redirectUri);

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
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
  ): Promise<OAuthTokens> {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: client.client_id,
      refresh_token: refreshToken,
    });
    if (client.client_secret) params.set('client_secret', client.client_secret);
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

export function createGoogleOAuthProvider(clientId: string, clientSecret: string): GoogleOAuthProvider {
  return new GoogleOAuthProvider(clientId, clientSecret);
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
