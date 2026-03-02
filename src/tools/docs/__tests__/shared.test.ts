import { describe, it, expect } from 'vitest';
import { extractTabText, formatDocTabs } from '../shared.js';

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
