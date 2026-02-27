import os from 'os';
import path from 'path';

export const CHARACTER_LIMIT = 25000;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const OAUTH_CALLBACK_PORT = 8080;

export const TOKENS_PATH =
  process.env.GOOGLE_TOKENS_PATH ?? path.join(os.homedir(), '.google-mcp-tokens.json');

/**
 * Full set of OAuth2 scopes for all supported Google Workspace APIs.
 * Individual tools use whatever subset is available after auth.
 */
export const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/presentations',
];
