import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getAuthUrl } from '../../auth/oauth.js';
import { startCallbackServer } from '../../auth/callback.js';
import { OAUTH_CALLBACK_PORT } from '../../constants.js';
import { handleGoogleError } from '../../utils/errors.js';

export function registerAuthStart(server: McpServer): void {
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
}
