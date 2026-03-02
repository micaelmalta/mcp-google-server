import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getDrive, FILE_FIELDS, mapFile, formatFileListResponse } from './shared.js';
import { ResponseFormat } from '../../types.js';
import { handleGoogleError } from '../../utils/errors.js';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../constants.js';

export function registerSearchFiles(server: McpServer): void {
  server.registerTool(
    'google_drive_search_files',
    {
      title: 'Search Google Drive Files',
      description: `Searches Google Drive files using Drive query syntax.

Drive query syntax examples:
  - name contains 'budget'            — name contains text
  - fullText contains 'Q3 results'    — full-text search in content
  - mimeType='application/vnd.google-apps.document'  — Google Docs only
  - mimeType='application/vnd.google-apps.spreadsheet' — Sheets only
  - mimeType='application/vnd.google-apps.folder'    — folders only
  - modifiedTime > '2024-01-01T00:00:00'             — modified after date
  - 'user@example.com' in owners                      — owned by user
  - sharedWithMe=true                                 — files shared with me
  - starred=true                                      — starred files

Combine with 'and': name contains 'report' and modifiedTime > '2024-01-01T00:00:00'

Args:
  - query: Drive query string (required)
  - limit: Max results (1-${MAX_PAGE_SIZE}, default: ${DEFAULT_PAGE_SIZE})
  - page_token: Pagination token
  - response_format: 'markdown' or 'json'`,
      inputSchema: z.object({
        query: z.string().min(1).describe('Drive query string.'),
        limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
        page_token: z.string().optional(),
        response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ query, limit, page_token, response_format }) => {
      try {
        const drive = getDrive();
        const res = await drive.files.list({
          q: query,
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
