import { describe, it, expect, vi, beforeEach } from 'vitest';
import './_setup.js';
import {
  loadSheetsTools,
  registeredTools,
  mockSpreadsheetsCreate,
  mockValuesUpdate,
} from './_setup.js';

describe('google_sheets_create tool', () => {
  beforeEach(async () => {
    await loadSheetsTools();
    vi.clearAllMocks();
  });

  it('creates spreadsheet and returns spreadsheet_id and link', async () => {
    mockSpreadsheetsCreate.mockResolvedValue({
      data: { spreadsheetId: 'ss-new-1' },
    });
    mockValuesUpdate.mockResolvedValue({});

    const handler = registeredTools.get('google_sheets_create')!;
    const result = (await handler({ title: 'My Sheet', sheet_name: 'Sheet1' })) as {
      content: { type: string; text: string }[];
      structuredContent: { spreadsheet_id: string; web_view_link: string };
    };

    expect(mockSpreadsheetsCreate).toHaveBeenCalledWith({
      requestBody: {
        properties: { title: 'My Sheet' },
        sheets: [{ properties: { title: 'Sheet1' } }],
      },
    });
    expect(result.structuredContent.spreadsheet_id).toBe('ss-new-1');
    expect(result.structuredContent.web_view_link).toContain('ss-new-1');
  });

  it('creates spreadsheet with headers when headers provided', async () => {
    mockSpreadsheetsCreate.mockResolvedValue({
      data: { spreadsheetId: 'ss-2' },
    });
    mockValuesUpdate.mockResolvedValue({});

    const handler = registeredTools.get('google_sheets_create')!;
    await handler({
      title: 'With Headers',
      sheet_name: 'Sheet1',
      headers: 'Name, Email, Role',
    });

    expect(mockValuesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        spreadsheetId: 'ss-2',
        range: expect.stringContaining('Sheet1'),
        requestBody: { values: [['Name', 'Email', 'Role']] },
      })
    );
  });

  it('returns error on API failure', async () => {
    mockSpreadsheetsCreate.mockRejectedValue(new Error('Invalid request'));

    const handler = registeredTools.get('google_sheets_create')!;
    const result = (await handler({ title: 'Bad', sheet_name: 'Sheet1' })) as { isError: boolean };

    expect(result.isError).toBe(true);
  });
});
