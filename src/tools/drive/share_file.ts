import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getDrive } from './shared.js';
import { handleGoogleError } from '../../utils/errors.js';

export function registerShareFile(server: McpServer): void {
  server.registerTool(
    'google_drive_share_file',
    {
      title: 'Share a Google Drive File',
      description: `Shares a Google Drive file or folder with a user, group, or makes it publicly accessible.

Args:
  - file_id: File or folder ID to share
  - email: Email address to share with (omit for domain-wide or public sharing)
  - role: Access level — 'reader', 'commenter', 'writer', 'fileOrganizer' (folders only)
  - type: Share type — 'user' (specific person), 'group' (Google Group), 'domain' (your org), 'anyone' (public)
  - notify: Send notification email to new collaborators (default: true)

Returns:
  - permission_id: ID of the created permission
  - web_view_link: Link to share with collaborators`,
      inputSchema: z.object({
        file_id: z.string().min(1).describe('File or folder ID to share.'),
        role: z.enum(['reader', 'commenter', 'writer', 'fileOrganizer']).describe('Access level.'),
        type: z.enum(['user', 'group', 'domain', 'anyone']).describe('Share type.'),
        email: z.string().email().optional().describe('Email for user/group type.'),
        notify: z.boolean().default(true).describe('Send notification email.'),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ file_id, role, type, email, notify }) => {
      try {
        const drive = getDrive();
        const permission: Record<string, string> = { role, type };
        if (email) permission['emailAddress'] = email;

        const res = await drive.permissions.create({
          fileId: file_id,
          requestBody: permission,
          sendNotificationEmail: notify,
          fields: 'id',
        });

        const meta = await drive.files.get({ fileId: file_id, fields: 'name,webViewLink' });

        return {
          content: [
            {
              type: 'text',
              text: `File "${meta.data.name}" shared.\n- **Role**: ${role}\n- **Type**: ${type}${email ? `\n- **With**: ${email}` : ''}\n- **Permission ID**: \`${res.data.id}\`\n- [View File](${meta.data.webViewLink})`,
            },
          ],
          structuredContent: { permission_id: res.data.id, web_view_link: meta.data.webViewLink },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
