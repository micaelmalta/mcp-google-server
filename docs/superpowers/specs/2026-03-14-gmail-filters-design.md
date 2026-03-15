# Gmail Filter Management Tools — Design Spec

**Date:** 2026-03-14
**Status:** Approved

## Overview

Add five new MCP tools for managing Gmail filters via the `users.settings.filters` Gmail API resource. Gmail filters automatically apply actions (labeling, archiving, marking) to incoming mail matching specified criteria.

## Tools

| Tool | API Operation | Description |
|------|--------------|-------------|
| `google_gmail_list_filters` | `filters.list` | List all filters |
| `google_gmail_get_filter` | `filters.get` | Get a single filter by ID |
| `google_gmail_create_filter` | `filters.create` | Create a new filter |
| `google_gmail_delete_filter` | `filters.delete` | Delete a filter by ID |
| `google_gmail_update_filter` | `filters.delete` + `filters.create` | Replace an existing filter (not atomic) |

## File Structure

```
src/tools/gmail/
├── list_filters.ts
├── get_filter.ts
├── create_filter.ts
├── delete_filter.ts
├── update_filter.ts
├── index.ts              # +5 imports and registerXxx calls
└── __tests__/
    ├── _setup.ts         # +4 mock fns for settings.filters.{list,get,create,delete}
    ├── list_filters.test.ts
    ├── get_filter.test.ts
    ├── create_filter.test.ts
    ├── delete_filter.test.ts
    └── update_filter.test.ts
```

No changes needed to `shared.ts` — `getGmail()` already returns the `v1` client which includes `users.settings.filters`.

## Input Schemas

All inputs use Zod `.strict()`. All tools follow the existing pattern of returning both `content` (markdown) and `structuredContent` (JSON).

### `google_gmail_list_filters`
```typescript
z.object({
  response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN),
}).strict()
```

### `google_gmail_get_filter`
```typescript
z.object({
  filter_id: z.string().min(1),
  response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN),
}).strict()
```

### `google_gmail_create_filter`
```typescript
z.object({
  // Criteria — at least one required
  from:    z.string().optional(),
  to:      z.string().optional(),
  subject: z.string().optional(),
  query:   z.string().optional(),
  // Actions — at least one required
  add_labels:        z.string().optional(),   // comma-separated label IDs
  remove_labels:     z.string().optional(),   // comma-separated label IDs
  skip_inbox:        z.boolean().optional(),  // appends INBOX to removeLabelIds
  mark_as_read:      z.boolean().optional(),  // appends UNREAD to removeLabelIds
  mark_as_important: z.boolean().optional(),  // appends IMPORTANT to addLabelIds
}).strict()
```

### `google_gmail_delete_filter`
```typescript
z.object({
  filter_id: z.string().min(1),
}).strict()
```

### `google_gmail_update_filter`
Same as `create_filter` plus `filter_id: z.string().min(1)`.

## Action Merging Logic

For `create` and `update`, convenience booleans are merged with explicit label arrays before the API call:

```
addLabelIds    = dedupe([...parse(add_labels), ...(mark_as_important ? ['IMPORTANT'] : [])])
removeLabelIds = dedupe([...parse(remove_labels), ...(skip_inbox ? ['INBOX'] : []), ...(mark_as_read ? ['UNREAD'] : [])])
```

## Structured Output Shape

All filter-returning tools use this `structuredContent` shape:

```typescript
interface FilterResult {
  id: string;
  criteria: {
    from?: string;
    to?: string;
    subject?: string;
    query?: string;
  };
  action: {
    addLabelIds: string[];
    removeLabelIds: string[];
  };
  [key: string]: unknown; // required index signature per project convention
}
```

`list_filters` returns `{ filters: FilterResult[] }`.
`get_filter` and `create_filter` return `{ filter: FilterResult }`.
`update_filter` returns `{ filter: FilterResult }` (the newly created filter with its new ID).
`delete_filter` returns `{ filter_id: string }`.

## Error Handling

- All API errors go through `handleGoogleError()` with `isError: true` — consistent with all existing tools.
- Pre-flight validation errors (before any API call) return `isError: true` with a descriptive message:
  - `create` / `update` with no criteria fields: `"Error: At least one criteria field (from, to, subject, query) must be provided."`
  - `create` / `update` with no action fields: `"Error: At least one action must be provided (add_labels, remove_labels, skip_inbox, mark_as_read, or mark_as_important)."`
- `update_filter` tool description notes the non-atomic nature: if the create step fails after delete, the filter is lost. If the delete step itself fails, the error is returned immediately and create is not attempted.

## Testing

`_setup.ts` additions:
- Four new hoisted mock functions: `mockSettingsFiltersList`, `mockSettingsFiltersGet`, `mockSettingsFiltersCreate`, `mockSettingsFiltersDelete`
- `googleapis` mock extended with `settings: { filters: { list, get, create, delete } }`

Test cases per tool:
- **list**: markdown output with multiple filters; empty list; JSON format
- **get**: returns correct filter; propagates API error for unknown ID
- **create**: full happy path verifying label merge and dedup; validation error — no criteria; validation error — no action
- **delete**: success confirmation string; API error propagation
- **update**: verifies delete called first then create with new params; validation errors same as create

## Annotations

| Tool | readOnlyHint | destructiveHint | idempotentHint |
|------|-------------|-----------------|----------------|
| list_filters | true | false | true |
| get_filter | true | false | true |
| create_filter | false | false | false |
| delete_filter | false | true | true |
| update_filter | false | true | false |
