import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { google } from 'googleapis';
import { z } from 'zod';
import { requireAuth } from '../auth/oauth.js';
import { ResponseFormat } from '../types.js';
import { handleGoogleError } from '../utils/errors.js';
import { formatDate, truncateIfNeeded } from '../utils/format.js';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../constants.js';

function getDrive() {
  const auth = requireAuth();
  return google.drive({ version: 'v3', auth });
}

/** Standard file fields to request from Drive API */
const FILE_FIELDS = 'id,name,mimeType,size,createdTime,modifiedTime,parents,webViewLink,webContentLink,owners,shared,trashed';

export function registerDriveTools(server: McpServer): void {
  // ─── google_drive_list_files ──────────────────────────────────────────────
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

  // ─── google_drive_search_files ────────────────────────────────────────────
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

  // ─── google_drive_get_file ────────────────────────────────────────────────
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

  // ─── google_drive_create_folder ───────────────────────────────────────────
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

  // ─── google_drive_move_file ───────────────────────────────────────────────
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

        // Get current parents to remove them
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

  // ─── google_drive_delete_file ─────────────────────────────────────────────
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

        // Get file name first for a helpful response
        const meta = await drive.files.get({ fileId: file_id, fields: 'name' });

        await drive.files.update({ fileId: file_id, requestBody: { trashed: true } });

        return {
          content: [
            { type: 'text', text: `File "${meta.data.name}" (\`${file_id}\`) moved to Trash. Restore it from Google Drive Trash within 30 days if needed.` },
          ],
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );

  // ─── google_drive_share_file ──────────────────────────────────────────────
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

  // ─── google_drive_list_permissions ────────────────────────────────────────
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface DriveFile {
  [key: string]: unknown;
  id: string;
  name: string;
  mime_type: string;
  size: string | null;
  created_time: string;
  modified_time: string;
  parents: string[];
  web_view_link: string;
  web_content_link: string;
  owners: Array<{ email: string; display_name: string }>;
  shared: boolean;
  trashed: boolean;
}

function mapFile(f: {
  id?: string | null;
  name?: string | null;
  mimeType?: string | null;
  size?: string | null;
  createdTime?: string | null;
  modifiedTime?: string | null;
  parents?: string[] | null;
  webViewLink?: string | null;
  webContentLink?: string | null;
  owners?: Array<{ emailAddress?: string | null; displayName?: string | null }> | null;
  shared?: boolean | null;
  trashed?: boolean | null;
}): DriveFile {
  return {
    id: f.id ?? '',
    name: f.name ?? '',
    mime_type: f.mimeType ?? '',
    size: f.size ?? null,
    created_time: f.createdTime ?? '',
    modified_time: f.modifiedTime ?? '',
    parents: f.parents ?? [],
    web_view_link: f.webViewLink ?? '',
    web_content_link: f.webContentLink ?? '',
    owners: (f.owners ?? []).map((o) => ({ email: o.emailAddress ?? '', display_name: o.displayName ?? '' })),
    shared: f.shared ?? false,
    trashed: f.trashed ?? false,
  };
}

function formatFileListResponse(
  files: DriveFile[],
  nextPageToken: string | undefined,
  format: ResponseFormat
): { content: Array<{ type: 'text'; text: string }>; structuredContent: Record<string, unknown> } {
  let text: string;
  if (format === ResponseFormat.MARKDOWN) {
    const lines = [`# Drive Files (${files.length}${nextPageToken ? '+' : ''})`, ''];
    for (const f of files) {
      const typeShort = f.mime_type.split('.').pop() ?? f.mime_type;
      lines.push(`- **${f.name}** (${typeShort})`);
      lines.push(`  - ID: \`${f.id}\` | Modified: ${formatDate(f.modified_time)}`);
      if (f.web_view_link) lines.push(`  - [Open](${f.web_view_link})`);
    }
    if (nextPageToken) lines.push(`\n*Use page_token="${nextPageToken}" for next page.*`);
    text = lines.join('\n');
  } else {
    text = JSON.stringify({ files, next_page_token: nextPageToken, has_more: !!nextPageToken }, null, 2);
  }

  return {
    content: [{ type: 'text', text: truncateIfNeeded(text) }],
    structuredContent: { files, next_page_token: nextPageToken, has_more: !!nextPageToken },
  };
}
