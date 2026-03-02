import { describe, it, expect, vi, beforeEach } from 'vitest';
import './_setup.js';
import { loadDriveTools, registeredTools, mockPermissionsList } from './_setup.js';

describe('google_drive_list_permissions tool', () => {
  beforeEach(async () => {
    await loadDriveTools();
    vi.clearAllMocks();
  });

  it('returns permissions list in markdown', async () => {
    mockPermissionsList.mockResolvedValue({
      data: {
        permissions: [
          { id: 'p1', type: 'user', role: 'owner', emailAddress: 'owner@example.com', displayName: 'Owner' },
          { id: 'p2', type: 'user', role: 'reader', emailAddress: 'reader@example.com' },
        ],
      },
    });

    const handler = registeredTools.get('google_drive_list_permissions')!;
    const result = (await handler({
      file_id: 'f1',
      response_format: 'markdown',
    })) as { content: { type: string; text: string }[]; structuredContent: { permissions: unknown[] } };

    expect(result.content[0].text).toContain('Permissions');
    expect(result.structuredContent.permissions).toHaveLength(2);
  });

  it('returns error on API failure', async () => {
    mockPermissionsList.mockRejectedValue(new Error('Not found 404'));

    const handler = registeredTools.get('google_drive_list_permissions')!;
    const result = (await handler({ file_id: 'bad', response_format: 'markdown' })) as {
      isError: boolean;
    };

    expect(result.isError).toBe(true);
  });
});
