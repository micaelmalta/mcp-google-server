import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getDrive } from './shared.js';
import { ResponseFormat } from '../../types.js';
import { handleGoogleError } from '../../utils/errors.js';

export function registerListPermissions(server: McpServer): void {
  server.registerTool(
    'google_drive_list_permissions',
    {
      title: 'List Google Drive File Permissions',
      description: `Lists all sharing permissions for a Google Drive file or folder.

Args:
  - file_id: File or folder ID

Returns all current permissions including type, role, and email addresses.`,
      inputSchema: z.object({
        file_id: z.string().min(1).describe('File or folder ID.'),
        response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ file_id, response_format }) => {
      try {
        const drive = getDrive();
        const res = await drive.permissions.list({
          fileId: file_id,
          fields: 'permissions(id,type,role,emailAddress,displayName,domain)',
        });

        const permissions = (res.data.permissions ?? []).map((p) => ({
          id: p.id ?? '',
          type: p.type ?? '',
          role: p.role ?? '',
          email: p.emailAddress ?? '',
          name: p.displayName ?? '',
          domain: p.domain ?? '',
        }));

        let text: string;
        if (response_format === ResponseFormat.MARKDOWN) {
          const lines = [`# Permissions for \`${file_id}\``, ''];
          for (const p of permissions) {
            const who = p.email || p.domain || p.type;
            lines.push(`- **${p.role}** — ${who} (${p.type})`);
          }
          text = lines.join('\n');
        } else {
          text = JSON.stringify({ permissions }, null, 2);
        }

        return {
          content: [{ type: 'text', text }],
          structuredContent: { permissions },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
