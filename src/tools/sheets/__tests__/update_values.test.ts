import { describe, it, expect, vi, beforeEach } from 'vitest';
import './_setup.js';
import { loadSheetsTools, registeredTools, mockValuesUpdate } from './_setup.js';

describe('google_sheets_update_values tool', () => {
  beforeEach(async () => {
    await loadSheetsTools();
    vi.clearAllMocks();
  });

  it('updates range and returns updated_cells and updated_range', async () => {
    mockValuesUpdate.mockResolvedValue({
      data: {
        updatedRange: 'Sheet1!A1:B2',
        updatedCells: 4,
        updatedRows: 2,
      },
    });

    const handler = registeredTools.get('google_sheets_update_values')!;
    const result = (await handler({
      spreadsheet_id: 'ss-1',
      range: 'Sheet1!A1:B2',
      values: JSON.stringify([
        ['Name', 'Email'],
        ['Alice', 'alice@example.com'],
      ]),
    })) as {
      content: { type: string; text: string }[];
      structuredContent: { updated_cells: number; updated_range: string };
    };

    expect(mockValuesUpdate).toHaveBeenCalledWith({
      spreadsheetId: 'ss-1',
      range: 'Sheet1!A1:B2',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [
          ['Name', 'Email'],
          ['Alice', 'alice@example.com'],
        ],
      },
    });
    expect(result.content[0].text).toContain('Updated');
    expect(result.structuredContent.updated_cells).toBe(4);
  });

  it('returns error on invalid JSON values', async () => {
    const handler = registeredTools.get('google_sheets_update_values')!;
    const result = (await handler({
      spreadsheet_id: 'ss-1',
      range: 'Sheet1!A1',
      values: '{"not": "array"}',
    })) as { isError: boolean; content: { type: string; text: string }[] };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Invalid values JSON');
    expect(mockValuesUpdate).not.toHaveBeenCalled();
  });

  it('returns error on API failure', async () => {
    mockValuesUpdate.mockRejectedValue(new Error('Range not found'));

    const handler = registeredTools.get('google_sheets_update_values')!;
    const result = (await handler({
      spreadsheet_id: 'bad',
      range: 'Sheet1!A1',
      values: JSON.stringify([['x']]),
    })) as { isError: boolean };

    expect(result.isError).toBe(true);
  });
});
