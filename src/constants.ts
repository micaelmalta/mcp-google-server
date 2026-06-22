import fs from 'fs';
import os from 'os';
import path from 'path';

export const CHARACTER_LIMIT = 25000;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/**
 * OAuth callback HTTP listen port.
 * - Prefer GOOGLE_OAUTH_LISTEN_PORT (required if Docker maps e.g. 38475:8080 — set to 8080).
 * - Else, if GOOGLE_REDIRECT_URI includes an explicit port, use it (symmetric -p H:H setups).
 * - Else 8080.
 */
function resolveOAuthCallbackPort(): number {
  const explicit = Number(process.env.GOOGLE_OAUTH_LISTEN_PORT);
  if (Number.isFinite(explicit) && explicit > 0 && explicit < 65536) {
    return explicit;
  }
  const uri = process.env.GOOGLE_REDIRECT_URI;
  if (uri) {
    try {
      const u = new URL(uri);
      if (u.port) {
        const p = parseInt(u.port, 10);
        if (Number.isFinite(p) && p > 0 && p < 65536) {
          return p;
        }
      }
    } catch {
      /* ignore */
    }
  }
  return 8080;
}

export const OAUTH_CALLBACK_PORT = resolveOAuthCallbackPort();

/** Writable path for OAuth tokens. Docker read-only images cannot use ~/.google-mcp-tokens.json under /app. */
function resolveTokensPath(): string {
  if (process.env.GOOGLE_TOKENS_PATH) {
    return process.env.GOOGLE_TOKENS_PATH;
  }
  const homeDir = os.homedir();
  const homeFile = path.join(homeDir, '.google-mcp-tokens.json');
  try {
    fs.accessSync(homeDir, fs.constants.W_OK);
    return homeFile;
  } catch {
    return path.join(os.tmpdir(), 'google-mcp-tokens.json');
  }
}

export const TOKENS_PATH = resolveTokensPath();

/**
 * Full set of OAuth2 scopes for all supported Google Workspace APIs.
 * Individual tools use whatever subset is available after auth.
 */
export const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.settings.basic',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/presentations',
  'https://www.googleapis.com/auth/contacts.readonly',
  'https://www.googleapis.com/auth/directory.readonly',
];
