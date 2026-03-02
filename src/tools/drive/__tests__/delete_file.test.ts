import { describe, it, expect, vi, beforeEach } from 'vitest';
import './_setup.js';
import { loadDriveTools, registeredTools, mockFilesGet, mockFilesUpdate } from './_setup.js';

describe('google_drive_delete_file tool', () => {
  beforeEach(async () => {
    await loadDriveTools();
    vi.clearAllMocks();
  });

  it('trashes file and returns success', async () => {
    mockFilesGet.mockResolvedValue({ data: { name: 'ToDelete.pdf' } });
    mockFilesUpdate.mockResolvedValue({});

    const handler = registeredTools.get('google_drive_delete_file')!;
    const result = (await handler({ file_id: 'f1' })) as {
      content: { type: string; text: string }[];
    };

    expect(mockFilesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: 'f1',
        requestBody: { trashed: true },
      })
    );
    expect(result.content[0].text).toContain('ToDelete.pdf');
    expect(result.content[0].text).toContain('Trash');
  });

  it('returns error on API failure', async () => {
    mockFilesGet.mockRejectedValue(new Error('Forbidden'));

    const handler = registeredTools.get('google_drive_delete_file')!;
    const result = (await handler({ file_id: 'bad' })) as { isError: boolean };

    expect(result.isError).toBe(true);
  });
});
