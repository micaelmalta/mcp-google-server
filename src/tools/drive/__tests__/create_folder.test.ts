import { describe, it, expect, vi, beforeEach } from 'vitest';
import './_setup.js';
import { loadDriveTools, registeredTools, mockFilesCreate } from './_setup.js';

describe('google_drive_create_folder tool', () => {
  beforeEach(async () => {
    await loadDriveTools();
    vi.clearAllMocks();
  });

  it('creates folder and returns file_id and link', async () => {
    mockFilesCreate.mockResolvedValue({
      data: {
        id: 'folder-1',
        name: 'New Folder',
        webViewLink: 'https://drive.google.com/drive/folders/folder-1',
      },
    });

    const handler = registeredTools.get('google_drive_create_folder')!;
    const result = (await handler({ name: 'New Folder' })) as {
      content: { type: string; text: string }[];
      structuredContent: { file_id: string; web_view_link: string };
    };

    expect(mockFilesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: {
          name: 'New Folder',
          mimeType: 'application/vnd.google-apps.folder',
        },
      })
    );
    expect(result.structuredContent.file_id).toBe('folder-1');
    expect(result.structuredContent.web_view_link).toContain('folder-1');
  });

  it('returns error on API failure', async () => {
    mockFilesCreate.mockRejectedValue(new Error('Insufficient permission'));

    const handler = registeredTools.get('google_drive_create_folder')!;
    const result = (await handler({ name: 'Bad' })) as { isError: boolean };

    expect(result.isError).toBe(true);
  });
});
