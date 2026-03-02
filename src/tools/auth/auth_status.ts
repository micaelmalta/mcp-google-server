import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { isAuthenticated, getOAuthClient } from '../../auth/oauth.js';
import { TOKENS_PATH } from '../../constants.js';
import { handleGoogleError } from '../../utils/errors.js';

export function registerAuthStatus(server: McpServer): void {
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
}
