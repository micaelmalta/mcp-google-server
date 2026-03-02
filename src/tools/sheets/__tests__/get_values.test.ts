import { describe, it, expect, vi, beforeEach } from 'vitest';
import './_setup.js';
import { loadSheetsTools, registeredTools, mockValuesGet } from './_setup.js';

describe('google_sheets_get_values tool', () => {
  beforeEach(async () => {
    await loadSheetsTools();
    vi.clearAllMocks();
  });

  it('returns markdown table for range with data', async () => {
    mockValuesGet.mockResolvedValue({
      data: {
        range: 'Sheet1!A1:C2',
        values: [
          ['Name', 'Email', 'Date'],
          ['Alice', 'alice@example.com', '2026-03-01'],
        ],
      },
    });

    const handler = registeredTools.get('google_sheets_get_values')!;
    const result = (await handler({
      spreadsheet_id: 'ss-1',
      range: 'Sheet1!A1:C2',
      response_format: 'markdown',
    })) as {
      content: { type: string; text: string }[];
      structuredContent: { range: string; values: string[][]; row_count: number };
    };

    expect(result.content[0].text).toContain('Name');
    expect(result.content[0].text).toContain('Email');
    expect(result.content[0].text).toContain('Alice');
    expect(result.content[0].text).toContain('alice@example.com');
    expect(result.structuredContent.range).toBe('Sheet1!A1:C2');
    expect(result.structuredContent.row_count).toBe(2);
    expect(result.structuredContent.values).toHaveLength(2);
  });

  it('returns empty range message when no values', async () => {
    mockValuesGet.mockResolvedValue({
      data: { range: 'Sheet1!A1:A1', values: [] },
    });

    const handler = registeredTools.get('google_sheets_get_values')!;
    const result = (await handler({
      spreadsheet_id: 'ss-1',
      range: 'Sheet1!A1:A1',
      response_format: 'markdown',
    })) as { content: { type: string; text: string }[] };

    expect(result.content[0].text).toContain('empty');
  });

  it('returns JSON when response_format is json', async () => {
    mockValuesGet.mockResolvedValue({
      data: { range: 'Sheet1!A1:A1', values: [['Only']] },
    });

    const handler = registeredTools.get('google_sheets_get_values')!;
    const result = (await handler({
      spreadsheet_id: 'ss-1',
      range: 'Sheet1!A1:A1',
      response_format: 'json',
    })) as { content: { type: string; text: string }[] };

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.range).toBe('Sheet1!A1:A1');
    expect(parsed.values).toEqual([['Only']]);
  });

  it('returns error on API failure', async () => {
    mockValuesGet.mockRejectedValue(new Error('Spreadsheet not found 404'));

    const handler = registeredTools.get('google_sheets_get_values')!;
    const result = (await handler({
      spreadsheet_id: 'bad',
      range: 'Sheet1!A1',
      response_format: 'markdown',
    })) as { isError: boolean; content: { type: string; text: string }[] };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not found');
  });
});
