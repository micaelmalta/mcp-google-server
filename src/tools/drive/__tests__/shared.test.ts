import { describe, it, expect } from 'vitest';
import { mapFile, formatFileListResponse, type DriveFile } from '../shared.js';
import { ResponseFormat } from '../../../types.js';

describe('mapFile', () => {
  it('maps full API file to DriveFile', () => {
    const apiFile = {
      id: 'file-1',
      name: 'Doc.pdf',
      mimeType: 'application/pdf',
      size: '1024',
      createdTime: '2026-01-01T00:00:00Z',
      modifiedTime: '2026-03-01T12:00:00Z',
      parents: ['folder-1'],
      webViewLink: 'https://drive.google.com/file/d/file-1/view',
      webContentLink: 'https://drive.google.com/uc?id=file-1',
      owners: [{ emailAddress: 'a@example.com', displayName: 'Alice' }],
      shared: true,
      trashed: false,
    };

    expect(mapFile(apiFile)).toEqual({
      id: 'file-1',
      name: 'Doc.pdf',
      mime_type: 'application/pdf',
      size: '1024',
      created_time: '2026-01-01T00:00:00Z',
      modified_time: '2026-03-01T12:00:00Z',
      parents: ['folder-1'],
      web_view_link: 'https://drive.google.com/file/d/file-1/view',
      web_content_link: 'https://drive.google.com/uc?id=file-1',
      owners: [{ email: 'a@example.com', display_name: 'Alice' }],
      shared: true,
      trashed: false,
    });
  });

  it('uses empty defaults for missing fields', () => {
    expect(mapFile({})).toEqual({
      id: '',
      name: '',
      mime_type: '',
      size: null,
      created_time: '',
      modified_time: '',
      parents: [],
      web_view_link: '',
      web_content_link: '',
      owners: [],
      shared: false,
      trashed: false,
    });
  });

  it('maps multiple owners', () => {
    const result = mapFile({
      owners: [
        { emailAddress: 'a@x.com', displayName: 'A' },
        { emailAddress: null, displayName: undefined },
      ],
    });
    expect(result.owners).toHaveLength(2);
    expect(result.owners[0]).toEqual({ email: 'a@x.com', display_name: 'A' });
    expect(result.owners[1]).toEqual({ email: '', display_name: '' });
  });
});

describe('formatFileListResponse', () => {
  const files: DriveFile[] = [
    {
      id: 'f1',
      name: 'Sheet1',
      mime_type: 'application/vnd.google-apps.spreadsheet',
      size: null,
      created_time: '',
      modified_time: '2026-03-01T10:00:00Z',
      parents: [],
      web_view_link: 'https://drive.google.com/file/d/f1/view',
      web_content_link: '',
      owners: [],
      shared: false,
      trashed: false,
    },
  ];

  it('returns markdown with heading and file list', () => {
    const result = formatFileListResponse(files, undefined, ResponseFormat.MARKDOWN);
    expect(result.content[0].text).toContain('# Drive Files (1)');
    expect(result.content[0].text).toContain('**Sheet1**');
    expect(result.content[0].text).toContain('spreadsheet');
    expect(result.content[0].text).toContain('f1');
    expect(result.structuredContent.files).toEqual(files);
    expect(result.structuredContent.next_page_token).toBeUndefined();
    expect(result.structuredContent.has_more).toBe(false);
  });

  it('includes page token hint in markdown when nextPageToken present', () => {
    const result = formatFileListResponse(files, 'token-abc', ResponseFormat.MARKDOWN);
    expect(result.content[0].text).toContain('page_token="token-abc"');
    expect(result.structuredContent.next_page_token).toBe('token-abc');
    expect(result.structuredContent.has_more).toBe(true);
  });

  it('returns JSON format', () => {
    const result = formatFileListResponse(files, 't', ResponseFormat.JSON);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.files).toHaveLength(1);
    expect(parsed.next_page_token).toBe('t');
    expect(parsed.has_more).toBe(true);
  });
});
