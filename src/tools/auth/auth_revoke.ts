import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { revokeTokens } from '../../auth/oauth.js';

export function registerAuthRevoke(server: McpServer): void {
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
