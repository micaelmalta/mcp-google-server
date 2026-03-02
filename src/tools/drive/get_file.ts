import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getDrive, FILE_FIELDS, mapFile } from './shared.js';
import { ResponseFormat } from '../../types.js';
import { handleGoogleError } from '../../utils/errors.js';
import { formatDate } from '../../utils/format.js';

export function registerGetFile(server: McpServer): void {
  server.registerTool(
    'google_drive_get_file',
    {
      title: 'Get Google Drive File Metadata',
      description: `Retrieves metadata for a specific Google Drive file.

Args:
  - file_id: File ID from google_drive_list_files or google_drive_search_files

Returns full file metadata including name, MIME type, size, owner, sharing settings, and parent folders.`,
      inputSchema: z.object({
        file_id: z.string().min(1).describe('File ID.'),
        response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ file_id, response_format }) => {
      try {
        const drive = getDrive();
        const res = await drive.files.get({
          fileId: file_id,
          fields: FILE_FIELDS + ',description,permissions',
        });

        const file = mapFile(res.data);

        let text: string;
        if (response_format === ResponseFormat.MARKDOWN) {
          const lines = [
            `# ${file.name}`,
            '',
            `- **Type**: ${file.mime_type}`,
            `- **Size**: ${file.size ? `${Math.round(parseInt(file.size) / 1024)} KB` : 'N/A (Google Workspace file)'}`,
            `- **Modified**: ${formatDate(file.modified_time)}`,
            `- **Created**: ${formatDate(file.created_time)}`,
            `- **Owner**: ${file.owners.map((o) => o.display_name || o.email).join(', ')}`,
            `- **Shared**: ${file.shared ? 'Yes' : 'No'}`,
            file.web_view_link ? `- **Open**: [View in Drive](${file.web_view_link})` : '',
          ].filter(Boolean);
          text = lines.join('\n');
        } else {
          text = JSON.stringify(file, null, 2);
        }

        return {
          content: [{ type: 'text', text }],
          structuredContent: file,
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
