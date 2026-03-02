import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getDrive } from './shared.js';
import { handleGoogleError } from '../../utils/errors.js';

export function registerMoveFile(server: McpServer): void {
  server.registerTool(
    'google_drive_move_file',
    {
      title: 'Move a Google Drive File',
      description: `Moves a file to a different folder in Google Drive.

Args:
  - file_id: File ID to move
  - destination_folder_id: ID of the destination folder`,
      inputSchema: z.object({
        file_id: z.string().min(1).describe('File ID to move.'),
        destination_folder_id: z.string().min(1).describe('Destination folder ID.'),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ file_id, destination_folder_id }) => {
      try {
        const drive = getDrive();

        const current = await drive.files.get({ fileId: file_id, fields: 'parents,name' });
        const previousParents = (current.data.parents ?? []).join(',');

        const res = await drive.files.update({
          fileId: file_id,
          addParents: destination_folder_id,
          removeParents: previousParents,
          fields: 'id,name,parents',
        });

        return {
          content: [
            { type: 'text', text: `File "${res.data.name}" moved to folder \`${destination_folder_id}\`.` },
          ],
          structuredContent: { file_id: res.data.id, name: res.data.name, new_parent: destination_folder_id },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
