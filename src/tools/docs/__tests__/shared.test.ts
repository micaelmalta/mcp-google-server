import { describe, it, expect } from 'vitest';
import { extractTabText } from '../shared.js';

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
