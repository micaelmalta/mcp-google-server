import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getDrive } from './shared.js';
import { handleGoogleError } from '../../utils/errors.js';

export function registerDeleteFile(server: McpServer): void {
  server.registerTool(
    'google_drive_delete_file',
    {
      title: 'Delete a Google Drive File',
      description: `Moves a file to Google Drive Trash. The file can be restored from Trash within 30 days.

Args:
  - file_id: File ID to trash

Note: This does NOT permanently delete the file — it moves it to Trash. To permanently delete, the user must empty the Trash in Google Drive.`,
      inputSchema: z.object({
        file_id: z.string().min(1).describe('File ID to move to Trash.'),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ file_id }) => {
      try {
        const drive = getDrive();

        const meta = await drive.files.get({ fileId: file_id, fields: 'name' });

        await drive.files.update({ fileId: file_id, requestBody: { trashed: true } });

        return {
          content: [
            {
              type: 'text',
              text: `File "${meta.data.name}" (\`${file_id}\`) moved to Trash. Restore it from Google Drive Trash within 30 days if needed.`,
            },
          ],
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
