import { describe, it, expect, vi, beforeEach } from 'vitest';
import './_setup.js';
import {
  loadSheetsTools,
  registeredTools,
  mockValuesAppend,
} from './_setup.js';

describe('google_sheets_append_values tool', () => {
  beforeEach(async () => {
    await loadSheetsTools();
    vi.clearAllMocks();
  });

  it('appends rows and returns updated_range and updated_rows', async () => {
    mockValuesAppend.mockResolvedValue({
      data: {
        updates: {
          updatedRange: 'Sheet1!A2:B2',
          updatedRows: 1,
        },
      },
    });

    const handler = registeredTools.get('google_sheets_append_values')!;
    const result = (await handler({
      spreadsheet_id: 'ss-1',
      range: 'Sheet1',
      values: JSON.stringify([['Alice', 'alice@example.com']]),
    })) as {
      content: { type: string; text: string }[];
      structuredContent: { updated_range: string; updated_rows: number };
    };

    expect(mockValuesAppend).toHaveBeenCalledWith({
      spreadsheetId: 'ss-1',
      range: 'Sheet1',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [['Alice', 'alice@example.com']] },
    });
    expect(result.content[0].text).toContain('Appended');
    expect(result.structuredContent.updated_rows).toBe(1);
  });

  it('returns error on invalid JSON values', async () => {
    const handler = registeredTools.get('google_sheets_append_values')!;
    const result = (await handler({
      spreadsheet_id: 'ss-1',
      range: 'Sheet1',
      values: 'not json',
    })) as { isError: boolean; content: { type: string; text: string }[] };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Invalid values JSON');
    expect(mockValuesAppend).not.toHaveBeenCalled();
  });

  it('returns error on API failure', async () => {
    mockValuesAppend.mockRejectedValue(new Error('Spreadsheet not found'));

    const handler = registeredTools.get('google_sheets_append_values')!;
    const result = (await handler({
      spreadsheet_id: 'bad',
      range: 'Sheet1',
      values: JSON.stringify([['x']]),
    })) as { isError: boolean };

    expect(result.isError).toBe(true);
  });
});
