import { describe, it, expect, vi, beforeEach } from 'vitest';
import './_setup.js';
import { loadDriveTools, registeredTools, mockFilesList, makeDriveFile } from './_setup.js';

describe('google_drive_list_files tool', () => {
  beforeEach(async () => {
    await loadDriveTools();
    vi.clearAllMocks();
  });

  it('returns markdown list of files', async () => {
    mockFilesList.mockResolvedValue({
      data: { files: [makeDriveFile(), makeDriveFile({ id: 'file-2', name: 'Second' })], nextPageToken: undefined },
    });

    const handler = registeredTools.get('google_drive_list_files')!;
    const result = (await handler({ limit: 20, response_format: 'markdown' })) as {
      content: { type: string; text: string }[];
      structuredContent: { files: unknown[] };
    };

    expect(result.content[0].text).toContain('# Drive Files (2)');
    expect(result.content[0].text).toContain('Test File');
    expect(result.content[0].text).toContain('Second');
    expect(result.structuredContent.files).toHaveLength(2);
  });

  it('passes folder_id in query', async () => {
    mockFilesList.mockResolvedValue({ data: { files: [], nextPageToken: undefined } });

    const handler = registeredTools.get('google_drive_list_files')!;
    await handler({ folder_id: 'folder-123', limit: 10, response_format: 'json' });

    expect(mockFilesList).toHaveBeenCalledWith(
      expect.objectContaining({
        q: expect.stringContaining("'folder-123' in parents"),
      })
    );
  });

  it('returns error on API failure', async () => {
    mockFilesList.mockRejectedValue(new Error('Insufficient permission'));

    const handler = registeredTools.get('google_drive_list_files')!;
    const result = (await handler({ limit: 20, response_format: 'markdown' })) as {
      isError: boolean;
      content: { type: string; text: string }[];
    };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Insufficient');
  });
});
