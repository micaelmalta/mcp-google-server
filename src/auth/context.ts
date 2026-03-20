import { AsyncLocalStorage } from 'async_hooks';
import { OAuth2Client } from 'google-auth-library';

/**
 * Per-request OAuth2 client context.
 *
 * In HTTP mode, each request sets this before the MCP handler runs so that
 * requireAuth() picks up the request-scoped client instead of the stdio singleton.
 */
export const authContext = new AsyncLocalStorage<OAuth2Client>();
