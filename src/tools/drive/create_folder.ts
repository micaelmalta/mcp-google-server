import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getDrive } from './shared.js';
import { handleGoogleError } from '../../utils/errors.js';

export function registerCreateFolder(server: McpServer): void {
  server.registerTool(
    'google_drive_create_folder',
    {
      title: 'Create a Google Drive Folder',
      description: `Creates a new folder in Google Drive.

Args:
  - name: Folder name (required)
  - parent_id: ID of the parent folder (omit to create in 'My Drive' root)

Returns:
  - file_id: ID of the created folder
  - web_view_link: URL to the folder in Drive`,
      inputSchema: z.object({
        name: z.string().min(1).describe('Folder name.'),
        parent_id: z.string().optional().describe('Parent folder ID.'),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ name, parent_id }) => {
      try {
        const drive = getDrive();
        const res = await drive.files.create({
          requestBody: {
            name,
            mimeType: 'application/vnd.google-apps.folder',
            parents: parent_id ? [parent_id] : undefined,
          },
          fields: 'id,name,webViewLink',
        });

        return {
          content: [
            {
              type: 'text',
              text: `Folder created: **${res.data.name}**\n- ID: \`${res.data.id}\`\n- [Open in Drive](${res.data.webViewLink})`,
            },
          ],
          structuredContent: { file_id: res.data.id, name: res.data.name, web_view_link: res.data.webViewLink },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
