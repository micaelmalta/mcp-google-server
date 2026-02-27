import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getAuthUrl, isAuthenticated, revokeTokens, getOAuthClient } from '../auth/oauth.js';
import { startCallbackServer } from '../auth/callback.js';
import { TOKENS_PATH, OAUTH_CALLBACK_PORT } from '../constants.js';
import { handleGoogleError } from '../utils/errors.js';

export function registerAuthTools(server: McpServer): void {
  // ─── google_auth_start ────────────────────────────────────────────────────
  server.registerTool(
    'google_auth_start',
    {
      title: 'Start Google OAuth2 Authorization',
      description: `Initiates the Google OAuth2 authorization flow for all Google Workspace APIs.

Starts a local callback server on port ${OAUTH_CALLBACK_PORT} and returns a URL for the user to visit in their browser. After the user grants permission, Google redirects to the local server which automatically exchanges the code for tokens.

Steps:
1. Call this tool to get the authorization URL
2. Open the URL in your browser
3. Click "Allow" to grant permissions
4. The browser will show a success message when complete
5. You can now use all Google Workspace tools

Returns:
  - auth_url (string): The URL to open in your browser
  - message (string): Instructions for the user

Note: Requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.
Note: Redirect URI must be configured as http://localhost:${OAUTH_CALLBACK_PORT}/callback in Google Cloud Console.`,
      inputSchema: z.object({}).strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async () => {
      try {
        await startCallbackServer();
        const url = getAuthUrl();

        return {
          content: [
            {
              type: 'text',
              text: `## Google OAuth2 Authorization\n\n**Step 1:** Open this URL in your browser:\n\n${url}\n\n**Step 2:** Sign in with your Google account and click "Allow" to grant permissions.\n\n**Step 3:** Your browser will show "Authorization Successful!" — you can then close the tab.\n\nAll Google Workspace tools (Calendar, Gmail, Drive, Docs, Sheets, Slides) will be available once authorized.`,
            },
          ],
          structuredContent: { auth_url: url },
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: 'text', text: handleGoogleError(error) }],
        };
      }
    }
  );

  // ─── google_auth_status ───────────────────────────────────────────────────
  server.registerTool(
    'google_auth_status',
    {
      title: 'Check Google Authentication Status',
      description: `Checks whether Google OAuth2 credentials are available and valid.

Returns the current authentication status including:
- Whether access and refresh tokens are present
- Token expiry time (if available)
- The path where tokens are stored

Use this to verify authentication before making API calls, or to diagnose authentication issues.

Returns:
  - authenticated (boolean): Whether valid credentials are present
  - has_refresh_token (boolean): Whether a persistent refresh token is saved
  - expires_at (string | null): ISO timestamp when the access token expires
  - tokens_path (string): File path where tokens are stored`,
      inputSchema: z.object({}).strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      try {
        const authenticated = isAuthenticated();
        const client = authenticated ? getOAuthClient() : null;
        const creds = client?.credentials ?? {};

        const status = {
          authenticated,
          has_refresh_token: !!creds.refresh_token,
          expires_at: creds.expiry_date
            ? new Date(creds.expiry_date).toISOString()
            : null,
          tokens_path: TOKENS_PATH,
        };

        const text = authenticated
          ? `## Authentication Status: ✓ Authenticated\n\n- Refresh token: ${status.has_refresh_token ? 'Present' : 'Missing (will need to re-auth)'}\n- Token expires: ${status.expires_at ?? 'Unknown'}\n- Tokens stored at: \`${TOKENS_PATH}\``
          : `## Authentication Status: ✗ Not Authenticated\n\nNo valid credentials found. Use \`google_auth_start\` to authorize.`;

        return {
          content: [{ type: 'text', text }],
          structuredContent: status,
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: 'text', text: handleGoogleError(error) }],
        };
      }
    }
  );

  // ─── google_auth_revoke ───────────────────────────────────────────────────
  server.registerTool(
    'google_auth_revoke',
    {
      title: 'Revoke Google Authentication',
      description: `Revokes and deletes the stored Google OAuth2 tokens.

This removes the locally saved token file and clears in-memory credentials. The Google authorization grant itself is not revoked on Google's servers — you can re-authorize at any time using google_auth_start.

Use this to:
- Switch to a different Google account
- Clear credentials for security purposes
- Fix authentication issues by starting fresh`,
      inputSchema: z.object({}).strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      revokeTokens();
      return {
        content: [
          {
            type: 'text',
            text: 'Google credentials revoked. Token file deleted. Use google_auth_start to re-authenticate.',
          },
        ],
      };
    }
  );
}
