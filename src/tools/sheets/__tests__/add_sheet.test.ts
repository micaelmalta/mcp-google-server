import { describe, it, expect, vi, beforeEach } from 'vitest';
import './_setup.js';
import {
  loadSheetsTools,
  registeredTools,
  mockBatchUpdate,
  mockSpreadsheetsGet,
  mockValuesUpdate,
} from './_setup.js';

describe('google_sheets_add_sheet tool', () => {
  beforeEach(async () => {
    await loadSheetsTools();
    vi.clearAllMocks();
  });

  it('adds sheet and returns sheet_id and formatted response', async () => {
    mockBatchUpdate.mockResolvedValue({
      data: {
        replies: [{ addSheet: { properties: { sheetId: 12345, title: 'New Tab' } } }],
      },
    });
    mockValuesUpdate.mockResolvedValue({});

    const handler = registeredTools.get('google_sheets_add_sheet')!;
    const result = (await handler({
      spreadsheet_id: 'ss-1',
      title: 'New Tab',
    })) as {
      content: { type: string; text: string }[];
      structuredContent: { sheet_id: number; sheet_name: string };
    };

    expect(mockBatchUpdate).toHaveBeenCalledWith({
      spreadsheetId: 'ss-1',
      requestBody: { requests: [{ addSheet: { properties: { title: 'New Tab' } } }] },
    });
    expect(result.structuredContent.sheet_id).toBe(12345);
    expect(result.structuredContent.sheet_name).toBe('New Tab');
  });

  it('falls back to spreadsheets.get when batchUpdate reply has no sheetId', async () => {
    mockBatchUpdate.mockResolvedValue({
      data: { replies: [{}] },
    });
    mockSpreadsheetsGet.mockResolvedValue({
      data: {
        sheets: [
          { properties: { sheetId: 0, title: 'Sheet1' } },
          { properties: { sheetId: 99999, title: 'New Tab' } },
        ],
      },
    });
    mockValuesUpdate.mockResolvedValue({});

    const handler = registeredTools.get('google_sheets_add_sheet')!;
    const result = (await handler({
      spreadsheet_id: 'ss-1',
      title: 'New Tab',
    })) as { structuredContent: { sheet_id: number } };

    expect(mockSpreadsheetsGet).toHaveBeenCalledWith({
      spreadsheetId: 'ss-1',
      includeGridData: false,
    });
    expect(result.structuredContent.sheet_id).toBe(99999);
  });

  it('adds headers when headers provided', async () => {
    mockBatchUpdate.mockResolvedValue({
      data: {
        replies: [{ addSheet: { properties: { sheetId: 42, title: 'Data' } } }],
      },
    });
    mockValuesUpdate.mockResolvedValue({});

    const handler = registeredTools.get('google_sheets_add_sheet')!;
    await handler({
      spreadsheet_id: 'ss-1',
      title: 'Data',
      headers: 'Name, Email, Date',
    });

    expect(mockValuesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        spreadsheetId: 'ss-1',
        range: expect.stringContaining('Data'),
        requestBody: { values: [['Name', 'Email', 'Date']] },
      })
    );
  });

  it('returns error when sheetId cannot be determined', async () => {
    mockBatchUpdate.mockResolvedValue({ data: { replies: [{}] } });
    mockSpreadsheetsGet.mockResolvedValue({
      data: {
        sheets: [{ properties: { sheetId: 0, title: 'Other' } }],
      },
    });

    const handler = registeredTools.get('google_sheets_add_sheet')!;
    const result = (await handler({
      spreadsheet_id: 'ss-1',
      title: 'New Tab',
    })) as { isError: boolean; content: { type: string; text: string }[] };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Unable to determine sheetId');
  });

  it('returns error on API failure', async () => {
    mockBatchUpdate.mockRejectedValue(new Error('Spreadsheet not found'));

    const handler = registeredTools.get('google_sheets_add_sheet')!;
    const result = (await handler({
      spreadsheet_id: 'bad',
      title: 'Tab',
    })) as { isError: boolean };

    expect(result.isError).toBe(true);
  });
});
