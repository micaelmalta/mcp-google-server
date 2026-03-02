import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getDrive, FILE_FIELDS, mapFile, formatFileListResponse } from './shared.js';
import { ResponseFormat } from '../../types.js';
import { handleGoogleError } from '../../utils/errors.js';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../constants.js';

export function registerListFiles(server: McpServer): void {
  server.registerTool(
    'google_drive_list_files',
    {
      title: 'List Google Drive Files',
      description: `Lists files in Google Drive with optional filters.

Args:
  - folder_id: ID of a folder to list files in (omit for root/My Drive)
  - query: Drive query string for filtering (see google_drive_search_files for syntax)
  - limit: Max files to return (1-${MAX_PAGE_SIZE}, default: ${DEFAULT_PAGE_SIZE})
  - page_token: Token from previous call for pagination
  - include_trashed: Whether to include trashed files (default: false)
  - response_format: 'markdown' or 'json'

Returns:
  - files[].id: File ID (use in other Drive/Docs/Sheets tools)
  - files[].name: File name
  - files[].mime_type: MIME type (e.g., "application/vnd.google-apps.document")
  - files[].size: File size in bytes
  - files[].modified_time: Last modified timestamp
  - files[].web_view_link: URL to open in browser`,
      inputSchema: z.object({
        folder_id: z.string().optional().describe("Folder ID to list. Omit for 'My Drive'."),
        query: z.string().optional().describe('Additional Drive query filters.'),
        limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
        page_token: z.string().optional(),
        include_trashed: z.boolean().default(false),
        response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ folder_id, query, limit, page_token, include_trashed, response_format }) => {
      try {
        const drive = getDrive();

        const queryParts: string[] = [];
        if (folder_id) queryParts.push(`'${folder_id}' in parents`);
        if (!include_trashed) queryParts.push('trashed=false');
        if (query) queryParts.push(query);

        const res = await drive.files.list({
          q: queryParts.join(' and ') || undefined,
          fields: `nextPageToken,files(${FILE_FIELDS})`,
          pageSize: limit,
          pageToken: page_token,
          orderBy: 'modifiedTime desc',
        });

        const files = (res.data.files ?? []).map(mapFile);
        const nextPageToken = res.data.nextPageToken ?? undefined;

        return formatFileListResponse(files, nextPageToken, response_format);
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
