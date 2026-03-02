import { describe, it, expect, vi, beforeEach } from 'vitest';
import './_setup.js';
import { loadSheetsTools, registeredTools, mockBatchUpdate } from './_setup.js';

describe('google_sheets_delete_sheet tool', () => {
  beforeEach(async () => {
    await loadSheetsTools();
    vi.clearAllMocks();
  });

  it('deletes sheet and returns success message', async () => {
    mockBatchUpdate.mockResolvedValue({});

    const handler = registeredTools.get('google_sheets_delete_sheet')!;
    const result = (await handler({
      spreadsheet_id: 'ss-1',
      sheet_id: 42,
    })) as { content: { type: string; text: string }[] };

    expect(mockBatchUpdate).toHaveBeenCalledWith({
      spreadsheetId: 'ss-1',
      requestBody: { requests: [{ deleteSheet: { sheetId: 42 } }] },
    });
    expect(result.content[0].text).toContain('42');
    expect(result.content[0].text).toContain('deleted');
  });

  it('returns error on API failure', async () => {
    mockBatchUpdate.mockRejectedValue(new Error('Cannot delete last sheet'));

    const handler = registeredTools.get('google_sheets_delete_sheet')!;
    const result = (await handler({
      spreadsheet_id: 'ss-1',
      sheet_id: 0,
    })) as { isError: boolean };

    expect(result.isError).toBe(true);
  });
});
