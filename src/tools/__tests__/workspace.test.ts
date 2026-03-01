import { describe, it, expect } from 'vitest';
import { extractTabText, formatDocTabs, parseHeaders, quoteSheetName, formatAddSheetResponse, formatDeleteSheetResponse } from '../workspace.js';

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

describe('quoteSheetName', () => {
  it('wraps a simple name in single quotes', () => {
    expect(quoteSheetName('Sheet1')).toBe("'Sheet1'");
  });

  it('wraps a name with spaces in single quotes', () => {
    expect(quoteSheetName('Q1 Revenue')).toBe("'Q1 Revenue'");
  });

  it('escapes embedded single quotes by doubling them', () => {
    expect(quoteSheetName("John's Data")).toBe("'John''s Data'");
  });

  it('handles names with special characters', () => {
    expect(quoteSheetName('Data — 2026')).toBe("'Data — 2026'");
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
      sheet_name: 'Meetings',
      spreadsheet_id: 'abc123',
      web_view_link: 'https://docs.google.com/spreadsheets/d/abc123/edit#gid=42',
    });
  });

  it('includes gid=0 for sheet ID 0', () => {
    const result = formatAddSheetResponse('xyz', 'Sheet1', 0);

    expect(result.structuredContent.sheet_id).toBe(0);
    expect(result.structuredContent.web_view_link).toContain('#gid=0');
  });

  it('handles special characters in sheet name', () => {
    const result = formatAddSheetResponse('id1', 'Q1 2026 — Revenue', 99);

    expect(result.text).toContain('**Q1 2026 — Revenue**');
    expect(result.structuredContent.sheet_name).toBe('Q1 2026 — Revenue');
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

describe('extractTabText', () => {
  it('extracts plain text from a tab body', () => {
    const tab = {
      documentTab: {
        body: {
          content: [
            {
              paragraph: {
                elements: [
                  { textRun: { content: 'Hello world\n' } },
                ],
              },
            },
          ],
        },
      },
    };
    expect(extractTabText(tab)).toBe('Hello world');
  });

  it('returns empty string for a tab with no content', () => {
    const tab = { documentTab: { body: { content: [] } } };
    expect(extractTabText(tab)).toBe('');
  });

  it('joins multiple paragraphs', () => {
    const tab = {
      documentTab: {
        body: {
          content: [
            { paragraph: { elements: [{ textRun: { content: 'First\n' } }] } },
            { paragraph: { elements: [{ textRun: { content: 'Second\n' } }] } },
          ],
        },
      },
    };
    expect(extractTabText(tab)).toBe('First\nSecond');
  });

  it('handles null/missing body gracefully', () => {
    expect(extractTabText({})).toBe('');
    expect(extractTabText({ documentTab: {} })).toBe('');
    expect(extractTabText({ documentTab: { body: null } })).toBe('');
  });
});

describe('formatDocTabs', () => {
  const singleTab = [{ tab_id: 't.1', title: 'Main', index: 0, text_content: 'Hello world' }];
  const multiTabs = [
    { tab_id: 't.1', title: 'Overview', index: 0, text_content: 'Intro text' },
    { tab_id: 't.2', title: 'Details', index: 1, text_content: 'Detail text' },
  ];

  it('single tab: returns content without tab header', () => {
    expect(formatDocTabs(singleTab)).toBe('Hello world');
  });

  it('multiple tabs: adds ## Tab: headers for each', () => {
    const result = formatDocTabs(multiTabs);
    expect(result).toBe('## Tab: Overview\nIntro text\n\n## Tab: Details\nDetail text');
  });

  it('focused tab by title (case-insensitive): returns just that tab content', () => {
    const result = formatDocTabs(multiTabs, 'details');
    expect(result).toBe('Detail text');
  });

  it('focused tab by tab_id: returns just that tab content', () => {
    const result = formatDocTabs(multiTabs, 't.1');
    expect(result).toBe('Intro text');
  });

  it('focused tab not found: returns error listing available tabs', () => {
    const result = formatDocTabs(multiTabs, 'missing');
    expect(result).toContain('Tab "missing" not found');
    expect(result).toContain('Overview (t.1)');
    expect(result).toContain('Details (t.2)');
  });
});
