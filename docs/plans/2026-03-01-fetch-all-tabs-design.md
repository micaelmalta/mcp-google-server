# Design: Fetch All Tabs in google_docs_get

**Date:** 2026-03-01

## Problem

`google_docs_get` currently only returns content from the first (default) tab of a Google Doc. Documents with multiple tabs silently lose all content beyond the first tab.

## Solution

Always fetch all tabs by default, with an optional filter to focus on a specific tab by title or ID.

## Changes to `google_docs_get`

### API Call

Pass `includeTabsContent: true` to `docs.documents.get`. This populates a `tabs` array on the response, each entry containing `tabProperties` (title, tabId, index) and `documentTab.body`.

### New Optional Parameter: `tab`

- Type: `string | undefined`
- When omitted: all tabs are returned
- When provided: matches against tab title (case-insensitive) or tab ID — first match wins
- If no match: returns an error listing available tab titles and IDs

### Markdown Output — All Tabs

```
# Document Title

## Tab: Overview
...content...

## Tab: Technical Details
...content...
```

For single-tab docs, no `## Tab:` header is added (backwards-compatible behavior).

### Markdown Output — Focused Tab

```
# Document Title > Technical Details

...content...
```

### Structured Content

Always returns a `tabs` array:

```json
{
  "document_id": "...",
  "title": "...",
  "tabs": [
    { "tab_id": "t.abc123", "title": "Overview", "index": 0, "text_content": "..." },
    { "tab_id": "t.def456", "title": "Technical Details", "index": 1, "text_content": "..." }
  ]
}
```

### Helper Refactor

- Add `extractTabText(tab)` that extracts plain text from a single tab's `documentTab.body`
- Update existing `extractDocText` to delegate to `extractTabText` for each tab
- Support nested child tabs (tabs can have `childTabs` in the API response)

## Backwards Compatibility

- Single-tab docs: behavior identical to current (no extra headers, same structured content shape — `tabs` array with one entry)
- Callers using `text_content` from structured content will need to access `tabs[0].text_content` instead of top-level `text_content`
