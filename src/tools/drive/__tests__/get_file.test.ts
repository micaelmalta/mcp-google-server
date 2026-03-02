import { describe, it, expect, vi, beforeEach } from 'vitest';
import './_setup.js';
import { loadDriveTools, registeredTools, mockFilesGet, makeDriveFile } from './_setup.js';

describe('google_drive_get_file tool', () => {
  beforeEach(async () => {
    await loadDriveTools();
    vi.clearAllMocks();
  });

  it('returns file metadata in markdown', async () => {
    mockFilesGet.mockResolvedValue({
      data: makeDriveFile({
        id: 'f1',
        name: 'My Doc',
        mimeType: 'application/vnd.google-apps.document',
        webViewLink: 'https://drive.google.com/file/d/f1/view',
      }),
    });

    const handler = registeredTools.get('google_drive_get_file')!;
    const result = (await handler({ file_id: 'f1', response_format: 'markdown' })) as {
      content: { type: string; text: string }[];
      structuredContent: { id: string; name: string };
    };

    expect(result.content[0].text).toContain('My Doc');
    expect(result.structuredContent.id).toBe('f1');
    expect(result.structuredContent.name).toBe('My Doc');
  });

  it('returns error on API failure', async () => {
    mockFilesGet.mockRejectedValue(new Error('File not found 404'));

    const handler = registeredTools.get('google_drive_get_file')!;
    const result = (await handler({ file_id: 'bad', response_format: 'markdown' })) as {
      isError: boolean;
    };

    expect(result.isError).toBe(true);
  });
});
