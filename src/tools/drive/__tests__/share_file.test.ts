import { describe, it, expect, vi, beforeEach } from 'vitest';
import './_setup.js';
import { loadDriveTools, registeredTools, mockPermissionsCreate, mockFilesGet } from './_setup.js';

describe('google_drive_share_file tool', () => {
  beforeEach(async () => {
    await loadDriveTools();
    vi.clearAllMocks();
  });

  it('shares file and returns permission_id', async () => {
    mockPermissionsCreate.mockResolvedValue({ data: { id: 'perm-123' } });
    mockFilesGet.mockResolvedValue({
      data: { name: 'Shared Doc', webViewLink: 'https://drive.google.com/file/d/f1/view' },
    });

    const handler = registeredTools.get('google_drive_share_file')!;
    const result = (await handler({
      file_id: 'f1',
      role: 'reader',
      type: 'user',
      email: 'viewer@example.com',
    })) as {
      content: { type: string; text: string }[];
      structuredContent: { permission_id: string };
    };

    expect(mockPermissionsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: 'f1',
        requestBody: expect.objectContaining({ role: 'reader', type: 'user' }),
      })
    );
    expect(result.structuredContent.permission_id).toBe('perm-123');
  });

  it('returns error on API failure', async () => {
    mockPermissionsCreate.mockRejectedValue(new Error('Invalid email'));

    const handler = registeredTools.get('google_drive_share_file')!;
    const result = (await handler({
      file_id: 'f1',
      role: 'reader',
      type: 'user',
      email: 'bad',
    })) as { isError: boolean };

    expect(result.isError).toBe(true);
  });
});
