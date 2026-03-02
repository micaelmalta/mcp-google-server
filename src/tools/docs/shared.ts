import { google } from 'googleapis';
import { requireAuth } from '../../auth/oauth.js';

export function getDocs() {
  return google.docs({ version: 'v1', auth: requireAuth() });
}

export interface TabData {
  tab_id: string;
  title: string;
  index: number;
  text_content: string;
}

/** Minimal type for Docs API tab body content used by extractTabText */
export interface DocsTabInput {
  documentTab?: {
    body?: {
      content?: Array<{
        paragraph?: {
          elements?: Array<{ textRun?: { content?: string | null } | null } | null>;
        } | null;
      }> | null;
    } | null;
  } | null;
}

export function extractTabText(tab: DocsTabInput): string {
  const lines: string[] = [];
  for (const element of tab.documentTab?.body?.content ?? []) {
    if (element.paragraph) {
      const text = (element.paragraph.elements ?? [])
        .map((el) => (el && el.textRun?.content) ?? '')
        .join('');
      if (text.trim()) lines.push(text);
    }
  }
  return lines.join('').trim();
}

export function formatDocTabs(tabs: TabData[], tabFilter?: string): string {
  if (tabFilter) {
    const lower = tabFilter.toLowerCase();
    const match = tabs.find(
      (t) => t.title.toLowerCase() === lower || t.tab_id === tabFilter
    );
    if (!match) {
      const available = tabs.map((t) => `${t.title} (${t.tab_id})`).join(', ');
      return `Tab "${tabFilter}" not found. Available tabs: ${available}`;
    }
    return match.text_content;
  }

  if (tabs.length === 1) {
    return tabs[0].text_content;
  }

  return tabs
    .map((t) => `## Tab: ${t.title}\n${t.text_content}`)
    .join('\n\n');
}
