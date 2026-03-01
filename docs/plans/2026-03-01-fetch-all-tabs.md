# Fetch All Tabs Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Update `google_docs_get` to always fetch all tabs by default, clearly distinguish tabs in output, and allow focusing on a specific tab by title or ID.

**Architecture:** Add `includeTabsContent: true` to the API call, introduce `extractTabText` helper to process a single tab's body, refactor output formatting to iterate tabs with section headers, and add an optional `tab` filter parameter.

**Tech Stack:** TypeScript, googleapis v144, Zod, Vitest (new - no test framework currently exists)

---

### Task 1: Set up Vitest for testing

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

**Step 1: Install vitest**

```bash
npm install --save-dev vitest
```

**Step 2: Add test script to `package.json`**

In the `scripts` section add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

**Step 3: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
```

**Step 4: Verify vitest works**

```bash
npm test
```
Expected: "No test files found" (or similar — no failures)

**Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest test framework"
```

---

### Task 2: Write failing tests for `extractTabText` helper

**Files:**
- Create: `src/tools/__tests__/workspace.test.ts`

**Step 1: Create the test file**

```typescript
import { describe, it, expect } from 'vitest';
import { extractTabText } from '../workspace.js';

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
```

**Step 2: Run tests to verify they fail**

```bash
npm test
```
Expected: FAIL — `extractTabText` is not exported from `workspace.ts`

---

### Task 3: Implement and export `extractTabText`, update `extractDocText`

**Files:**
- Modify: `src/tools/workspace.ts` (lines 661–689, the helpers section at the bottom)

**Step 1: Replace `extractDocText` with `extractTabText` and update `extractDocText`**

Remove the existing `extractDocText` function and replace with these two:

```typescript
/**
 * Extracts plain text from a single Google Docs tab.
 */
export function extractTabText(tab: {
  documentTab?: {
    body?: {
      content?: Array<{
        paragraph?: {
          elements?: Array<{
            textRun?: { content?: string | null } | null;
          }> | null;
        } | null;
      }> | null;
    } | null;
  } | null;
}): string {
  const lines: string[] = [];
  for (const element of tab.documentTab?.body?.content ?? []) {
    if (element.paragraph) {
      const text = (element.paragraph.elements ?? [])
        .map((el) => el.textRun?.content ?? '')
        .join('');
      if (text.trim()) lines.push(text);
    }
  }
  return lines.join('').trim();
}

/**
 * Extracts plain text from a Google Docs document body (legacy single-tab path).
 */
function extractDocText(doc: {
  body?: {
    content?: Array<{
      paragraph?: {
        elements?: Array<{
          textRun?: { content?: string | null } | null;
        }> | null;
      } | null;
    }> | null;
  } | null;
}): string {
  return extractTabText({ documentTab: { body: doc.body ?? null } });
}
```

Note: `extractDocText` is kept to avoid breaking anything but is now a thin wrapper. The `export` on `extractTabText` allows tests to import it directly.

**Step 2: Run tests to verify they pass**

```bash
npm test
```
Expected: All 4 tests PASS

**Step 3: Commit**

```bash
git add src/tools/workspace.ts src/tools/__tests__/workspace.test.ts
git commit -m "refactor: extract extractTabText helper and add tests"
```

---

### Task 4: Write failing tests for tab-aware `google_docs_get` output formatting

The tool itself calls the Google API, which is hard to unit test directly. Instead, write tests for a new pure helper function `formatDocTabs` that converts the tabs data into output strings.

**Files:**
- Modify: `src/tools/__tests__/workspace.test.ts`

**Step 1: Add these tests to the test file**

```typescript
import { formatDocTabs } from '../workspace.js';

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
```

**Step 2: Run tests to verify they fail**

```bash
npm test
```
Expected: FAIL — `formatDocTabs` not exported

---

### Task 5: Implement `formatDocTabs` helper

**Files:**
- Modify: `src/tools/workspace.ts` (add to helpers section at bottom)

**Step 1: Add `formatDocTabs` export before or after `extractTabText`**

```typescript
export interface TabData {
  tab_id: string;
  title: string;
  index: number;
  text_content: string;
}

/**
 * Formats tabs data into a markdown string.
 * - Single tab: returns content directly (no header)
 * - Multiple tabs: prefixes each with "## Tab: {title}"
 * - With filter: returns only the matching tab, or an error message
 */
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
```

**Step 2: Run tests to verify they pass**

```bash
npm test
```
Expected: All tests PASS

**Step 3: Commit**

```bash
git add src/tools/workspace.ts src/tools/__tests__/workspace.test.ts
git commit -m "feat: add formatDocTabs helper with tests"
```

---

### Task 6: Update `google_docs_get` tool — schema, API call, and response

**Files:**
- Modify: `src/tools/workspace.ts` lines 79–129 (the `google_docs_get` registration)

**Step 1: Update the tool description, input schema, and handler**

Replace the entire `google_docs_get` registration (from `server.registerTool('google_docs_get', ...`) with:

```typescript
server.registerTool(
  'google_docs_get',
  {
    title: 'Get Google Doc Content',
    description: `Retrieves the text content of a Google Docs document, including all tabs.

Args:
  - document_id: Document ID (from google_docs_create or google_drive_search_files)
  - tab: Optional tab title or tab ID to focus on a single tab. If omitted, all tabs are returned.
  - response_format: 'markdown' or 'json'

Returns the document title and content. When multiple tabs exist, each is labeled with its title.
For 'json' format, returns a structured tabs array with tab_id, title, index, and text_content per tab.`,
    inputSchema: z.object({
      document_id: z.string().min(1).describe('Document ID.'),
      tab: z.string().optional().describe('Tab title or tab ID to focus on. Omit to return all tabs.'),
      response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN),
    }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  async ({ document_id, tab, response_format }) => {
    try {
      const docs = getDocs();
      const res = await docs.documents.get({
        documentId: document_id,
        includeTabsContent: true,
      });
      const doc = res.data;

      // Build tabs array from API response
      const rawTabs = doc.tabs ?? [];
      const tabsData: TabData[] = rawTabs.length > 0
        ? rawTabs.map((t, i) => ({
            tab_id: t.tabProperties?.tabId ?? `tab_${i}`,
            title: t.tabProperties?.title ?? `Tab ${i + 1}`,
            index: t.tabProperties?.index ?? i,
            text_content: extractTabText(t),
          }))
        : [
            // Fallback for docs that don't return tabs (older docs / no tabs)
            {
              tab_id: 'tab_0',
              title: 'Main',
              index: 0,
              text_content: extractTabText({ documentTab: { body: doc.body ?? null } }),
            },
          ];

      const formattedContent = formatDocTabs(tabsData, tab);

      let text: string;
      if (response_format === ResponseFormat.MARKDOWN) {
        const titleSuffix = tab
          ? tabsData.find((t) => t.title.toLowerCase() === tab.toLowerCase() || t.tab_id === tab)?.title
          : undefined;
        const heading = titleSuffix
          ? `# ${doc.title ?? 'Untitled'} > ${titleSuffix}`
          : `# ${doc.title ?? 'Untitled'}`;
        text = `${heading}\n\n${formattedContent}`;
      } else {
        text = JSON.stringify(
          {
            document_id: doc.documentId,
            title: doc.title,
            revision_id: doc.revisionId,
            tabs: tabsData,
          },
          null,
          2
        );
      }

      return {
        content: [{ type: 'text', text: truncateIfNeeded(text) }],
        structuredContent: {
          document_id: doc.documentId,
          title: doc.title,
          tabs: tabsData,
        },
      };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
    }
  }
);
```

Note: `TabData` type is defined in the helpers section (Task 5). You'll need to make sure it's defined before this tool registration — since it's at the bottom of the file, move it to the top of the helpers section or export it from a separate location.

Actually, the simplest fix: move `TabData` and `formatDocTabs` to the top of the file (after imports), or just define `TabData` inline. The cleanest approach: define `TabData` near the top of the file, just before `registerWorkspaceTools`.

**Step 2: Move `TabData` interface to just before `registerWorkspaceTools`**

In `workspace.ts`, add this just before `export function registerWorkspaceTools(server: McpServer): void {`:

```typescript
interface TabData {
  tab_id: string;
  title: string;
  index: number;
  text_content: string;
}
```

And remove the duplicate `export interface TabData` from the helpers section (keeping `export function formatDocTabs`).

**Step 3: Build to check for TypeScript errors**

```bash
npm run build
```
Expected: exits with code 0, no errors

**Step 4: Run tests**

```bash
npm test
```
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/tools/workspace.ts
git commit -m "feat: update google_docs_get to fetch all tabs by default"
```

---

### Task 7: Manual smoke test

There are no integration tests for the live API, but verify the build is clean and the tool description looks right.

**Step 1: Build**

```bash
npm run build
```
Expected: No errors

**Step 2: Verify tool schema in built output**

```bash
node -e "import('./dist/index.js').catch(e => console.error(e.message))"
```
Expected: Server starts (or exits cleanly with auth error — not a parse/type error)

**Step 3: Final commit if any stray changes**

```bash
git status
```
If clean, nothing to do. If there are uncommitted changes, commit them.
