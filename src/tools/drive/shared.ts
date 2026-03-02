import { google } from 'googleapis';
import { requireAuth } from '../../auth/oauth.js';
import { ResponseFormat } from '../../types.js';
import { formatDate, truncateIfNeeded } from '../../utils/format.js';

export function getDrive() {
  const auth = requireAuth();
  return google.drive({ version: 'v3', auth });
}

export const FILE_FIELDS = 'id,name,mimeType,size,createdTime,modifiedTime,parents,webViewLink,webContentLink,owners,shared,trashed';

export interface DriveFile {
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

export function mapFile(f: {
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

export function formatFileListResponse(
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
