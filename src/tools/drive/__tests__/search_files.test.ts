import { describe, it, expect, vi, beforeEach } from 'vitest';
import './_setup.js';
import { loadDriveTools, registeredTools, mockFilesList, makeDriveFile } from './_setup.js';

describe('google_drive_search_files tool', () => {
  beforeEach(async () => {
    await loadDriveTools();
    vi.clearAllMocks();
  });

  it('returns files matching query', async () => {
    mockFilesList.mockResolvedValue({
      data: { files: [makeDriveFile({ name: 'Report.pdf' })], nextPageToken: undefined },
    });

    const handler = registeredTools.get('google_drive_search_files')!;
    const result = (await handler({
      query: "name contains 'Report'",
      limit: 20,
      response_format: 'markdown',
    })) as { content: { type: string; text: string }[]; structuredContent: { files: unknown[] } };

    expect(mockFilesList).toHaveBeenCalledWith(
      expect.objectContaining({ q: "name contains 'Report'" })
    );
    expect(result.structuredContent.files).toHaveLength(1);
  });

  it('returns error on API failure', async () => {
    mockFilesList.mockRejectedValue(new Error('Quota exceeded'));

    const handler = registeredTools.get('google_drive_search_files')!;
    const result = (await handler({
      query: 'test',
      response_format: 'markdown',
    })) as { isError: boolean };

    expect(result.isError).toBe(true);
  });
});
