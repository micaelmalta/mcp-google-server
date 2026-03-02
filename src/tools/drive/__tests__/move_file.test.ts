import { describe, it, expect, vi, beforeEach } from 'vitest';
import './_setup.js';
import { loadDriveTools, registeredTools, mockFilesGet, mockFilesUpdate } from './_setup.js';

describe('google_drive_move_file tool', () => {
  beforeEach(async () => {
    await loadDriveTools();
    vi.clearAllMocks();
  });

  it('moves file and returns success', async () => {
    mockFilesGet.mockResolvedValue({
      data: { parents: ['old-parent'], name: 'Doc.pdf' },
    });
    mockFilesUpdate.mockResolvedValue({
      data: { id: 'f1', name: 'Doc.pdf', parents: ['new-parent'] },
    });

    const handler = registeredTools.get('google_drive_move_file')!;
    const result = (await handler({
      file_id: 'f1',
      destination_folder_id: 'new-parent',
    })) as { content: { type: string; text: string }[]; structuredContent: { new_parent: string } };

    expect(mockFilesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: 'f1',
        addParents: 'new-parent',
      })
    );
    expect(result.structuredContent.new_parent).toBe('new-parent');
  });

  it('returns error on API failure', async () => {
    mockFilesGet.mockRejectedValue(new Error('Not found'));

    const handler = registeredTools.get('google_drive_move_file')!;
    const result = (await handler({
      file_id: 'bad',
      destination_folder_id: 'dest',
    })) as { isError: boolean };

    expect(result.isError).toBe(true);
  });
});
