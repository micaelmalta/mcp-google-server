import { google } from 'googleapis';
import { OAuth2Client, Credentials } from 'google-auth-library';
import fs from 'fs';
import { TOKENS_PATH, SCOPES } from '../constants.js';
import { authContext } from './context.js';

let _client: OAuth2Client | null = null;

function getCredentials(): { clientId: string; clientSecret: string; redirectUri: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables are required. ' +
        'See .env.example for setup instructions.'
    );
  }

  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:8080/callback';

  return { clientId, clientSecret, redirectUri };
}

/**
 * Returns a singleton OAuth2Client, loading saved tokens from disk if available.
 */
export function getOAuthClient(): OAuth2Client {
  if (_client) return _client;

  const { clientId, clientSecret, redirectUri } = getCredentials();
  _client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  // Load persisted tokens
  if (fs.existsSync(TOKENS_PATH)) {
    try {
      const saved = JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf-8')) as Credentials;
      _client.setCredentials(saved);
    } catch {
      // Non-fatal — user will need to re-authenticate
    }
  }

  // Persist refreshed tokens automatically
  _client.on('tokens', (tokens) => {
    saveTokens(tokens);
  });

  return _client;
}

/**
 * Builds a one-off OAuth2Client from a token JSON string (for HTTP mode).
 * The token JSON should contain at minimum a refresh_token.
 * Access tokens are refreshed automatically by the google-auth-library.
 */
export function buildClientFromTokens(tokenJson: string): OAuth2Client {
  const { clientId, clientSecret, redirectUri } = getCredentials();
  const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const parsed: unknown = JSON.parse(tokenJson);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Token JSON must be an object');
  }
  const tokens = parsed as Credentials;
  if (!tokens.access_token && !tokens.refresh_token) {
    throw new Error('Token JSON must contain at least an access_token or refresh_token');
  }
  client.setCredentials(tokens);
  return client;
}

/**
 * Merges new tokens with any existing saved tokens (preserves refresh_token).
 */
export function saveTokens(tokens: Credentials): void {
  let existing: Credentials = {};
  if (fs.existsSync(TOKENS_PATH)) {
    try {
      existing = JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf-8')) as Credentials;
    } catch {
      // Start fresh
    }
  }

  const merged: Credentials = { ...existing, ...tokens };
  fs.writeFileSync(TOKENS_PATH, JSON.stringify(merged, null, 2), { mode: 0o600 });

  const client = getOAuthClient();
  client.setCredentials(merged);
}

/**
 * Generates the Google OAuth2 authorization URL.
 */
export function getAuthUrl(): string {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Always prompt to ensure we get a refresh_token
  });
}

/**
 * Exchanges an authorization code for access + refresh tokens.
 */
export async function exchangeCode(code: string): Promise<void> {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  saveTokens(tokens);
}

/**
 * Returns true if we have credentials (access or refresh token).
 */
export function isAuthenticated(): boolean {
  try {
    const client = getOAuthClient();
    const creds = client.credentials;
    return !!(creds.access_token || creds.refresh_token);
  } catch {
    return false;
  }
}

/**
 * Returns the active OAuth2Client or throws if not authenticated.
 *
 * In HTTP mode, returns the per-request client from AsyncLocalStorage.
 * In stdio mode, returns the persistent singleton loaded from disk.
 */
export function requireAuth(): OAuth2Client {
  const contextClient = authContext.getStore();
  if (contextClient) return contextClient;

  const client = getOAuthClient();
  const creds = client.credentials;
  if (!creds.access_token && !creds.refresh_token) {
    throw new Error(
      'Not authenticated. Call google_auth_start to begin the OAuth2 flow.'
    );
  }
  return client;
}

/**
 * Clears all saved tokens from disk and memory.
 */
export function revokeTokens(): void {
  _client = null;
  if (fs.existsSync(TOKENS_PATH)) {
    fs.unlinkSync(TOKENS_PATH);
  }
}
