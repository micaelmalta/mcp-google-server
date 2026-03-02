import { describe, it, expect } from 'vitest';
import { parseHeaders, formatAddSheetResponse, formatDeleteSheetResponse } from '../workspace.js';

describe('parseHeaders', () => {
  it('splits comma-separated headers and trims whitespace', () => {
    expect(parseHeaders('Name, Email, Date')).toEqual(['Name', 'Email', 'Date']);
  });

  it('handles headers without extra whitespace', () => {
    expect(parseHeaders('A,B,C')).toEqual(['A', 'B', 'C']);
  });

  it('handles a single header', () => {
    expect(parseHeaders('Title')).toEqual(['Title']);
  });

  it('trims leading and trailing spaces on each header', () => {
    expect(parseHeaders('  First ,  Second  , Third  ')).toEqual(['First', 'Second', 'Third']);
  });
});

describe('formatAddSheetResponse', () => {
  it('returns correct text and structuredContent', () => {
    const result = formatAddSheetResponse('abc123', 'Meetings', 42);

    expect(result.text).toBe(
      'Tab created: **Meetings**\n- Sheet ID: `42`\n- [Open Spreadsheet](https://docs.google.com/spreadsheets/d/abc123/edit#gid=42)'
    );
    expect(result.structuredContent).toEqual({
      sheet_id: 42,
      title: 'Meetings',
      spreadsheet_id: 'abc123',
      web_view_link: 'https://docs.google.com/spreadsheets/d/abc123/edit#gid=42',
    });
  });

  it('includes gid=0 for sheet ID 0', () => {
    const result = formatAddSheetResponse('xyz', 'Sheet1', 0);

    expect(result.structuredContent.sheet_id).toBe(0);
    expect(result.structuredContent.web_view_link).toContain('#gid=0');
  });

  it('handles special characters in title', () => {
    const result = formatAddSheetResponse('id1', 'Q1 2026 — Revenue', 99);

    expect(result.text).toContain('**Q1 2026 — Revenue**');
    expect(result.structuredContent.title).toBe('Q1 2026 — Revenue');
  });
});

describe('formatDeleteSheetResponse', () => {
  it('returns correct text with sheet ID and spreadsheet link', () => {
    const result = formatDeleteSheetResponse('abc123', 42);

    expect(result.text).toBe(
      'Tab with sheet ID `42` deleted.\n- [Open Spreadsheet](https://docs.google.com/spreadsheets/d/abc123/edit)'
    );
  });

  it('does not include gid in the link', () => {
    const result = formatDeleteSheetResponse('abc123', 42);

    expect(result.text).not.toContain('#gid=');
  });
});
