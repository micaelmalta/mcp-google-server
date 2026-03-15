# Gmail Filter Management Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add five MCP tools (`list`, `get`, `create`, `delete`, `update`) for managing Gmail filters via the `users.settings.filters` Gmail API resource.

**Architecture:** Each tool lives in its own file under `src/tools/gmail/`, following the exact patterns of existing tools. Shared helpers (`formatFilter`, `buildCriteria`, `buildAction`) are added to the existing `shared.ts`. Tests use the existing Vitest mock harness in `__tests__/_setup.ts`, which is extended once with four new mock functions.

**Tech Stack:** TypeScript, googleapis v1 (`users.settings.filters`), Zod, Vitest

---

## Chunk 1: Setup + list_filters + get_filter

### Task 1: Extend `_setup.ts` and add helpers to `shared.ts`

**Files:**
- Modify: `src/tools/gmail/__tests__/_setup.ts`
- Modify: `src/tools/gmail/shared.ts`

- [ ] **Step 1: Add four new mock functions to `_setup.ts`**

In the `vi.hoisted()` block, add after `mockUsersGetProfile`:

```typescript
  mockSettingsFiltersList: vi.fn(),
  mockSettingsFiltersGet: vi.fn(),
  mockSettingsFiltersCreate: vi.fn(),
  mockSettingsFiltersDelete: vi.fn(),
```

After the existing exports, add:

```typescript
export const mockSettingsFiltersList = _mocks.mockSettingsFiltersList;
export const mockSettingsFiltersGet = _mocks.mockSettingsFiltersGet;
export const mockSettingsFiltersCreate = _mocks.mockSettingsFiltersCreate;
export const mockSettingsFiltersDelete = _mocks.mockSettingsFiltersDelete;
```

In the `vi.mock('googleapis', ...)` block, the `users` object currently ends with `drafts: { ... }`. Add `settings` as a new sibling key after `drafts`. The closing braces below are critical — do not omit them:

```typescript
        drafts: {
          list:   _mocks.mockDraftsList,
          get:    _mocks.mockDraftsGet,
          create: _mocks.mockDraftsCreate,
          update: _mocks.mockDraftsUpdate,
          delete: _mocks.mockDraftsDelete,
          send:   _mocks.mockDraftsSend,
        },
        settings: {
          filters: {
            list:   _mocks.mockSettingsFiltersList,
            get:    _mocks.mockSettingsFiltersGet,
            create: _mocks.mockSettingsFiltersCreate,
            delete: _mocks.mockSettingsFiltersDelete,
          },
        },
      },   // closes users
    }),    // closes gmail: () =>
  },       // closes google
}));       // closes vi.mock
```

- [ ] **Step 2: Add helpers to `shared.ts`**

`shared.ts` currently only contains `getGmail()`. Keep that function and append the following to the file. (Note: the spec says "no changes needed to `shared.ts`" — that refers only to the API client; `getGmail()` is reused unchanged. The helpers below are additions that keep filter-formatting logic DRY across `list_filters`, `get_filter`, `create_filter`, and `update_filter`.)

```typescript
export interface FilterResult {
  id: string;
  criteria: { from?: string; to?: string; subject?: string; query?: string };
  action: { addLabelIds: string[]; removeLabelIds: string[] };
  [key: string]: unknown;
}

type RawFilter = {
  id?: string | null;
  criteria?: { from?: string | null; to?: string | null; subject?: string | null; query?: string | null } | null;
  action?: { addLabelIds?: string[] | null; removeLabelIds?: string[] | null } | null;
};

export function formatFilter(f: RawFilter): FilterResult {
  return {
    id: f.id ?? '',
    criteria: {
      ...(f.criteria?.from    ? { from:    f.criteria.from    } : {}),
      ...(f.criteria?.to      ? { to:      f.criteria.to      } : {}),
      ...(f.criteria?.subject ? { subject: f.criteria.subject } : {}),
      ...(f.criteria?.query   ? { query:   f.criteria.query   } : {}),
    },
    action: {
      addLabelIds:    f.action?.addLabelIds    ?? [],
      removeLabelIds: f.action?.removeLabelIds ?? [],
    },
  };
}

export function buildCriteria(args: { from?: string; to?: string; subject?: string; query?: string }) {
  const criteria: { from?: string; to?: string; subject?: string; query?: string } = {};
  if (args.from)    criteria.from    = args.from;
  if (args.to)      criteria.to      = args.to;
  if (args.subject) criteria.subject = args.subject;
  if (args.query)   criteria.query   = args.query;
  return criteria;
}

export function buildAction(args: {
  add_labels?: string;
  remove_labels?: string;
  skip_inbox?: boolean;
  mark_as_read?: boolean;
  mark_as_important?: boolean;
}) {
  const addLabelIds = [
    ...(args.add_labels ? args.add_labels.split(',').map((l) => l.trim()).filter(Boolean) : []),
    ...(args.mark_as_important ? ['IMPORTANT'] : []),
  ];
  const removeLabelIds = [
    ...(args.remove_labels ? args.remove_labels.split(',').map((l) => l.trim()).filter(Boolean) : []),
    ...(args.skip_inbox  ? ['INBOX']  : []),
    ...(args.mark_as_read ? ['UNREAD'] : []),
  ];
  return {
    addLabelIds:    [...new Set(addLabelIds)],
    removeLabelIds: [...new Set(removeLabelIds)],
  };
}
```

- [ ] **Step 3: Run the existing test suite to confirm nothing is broken**

```bash
npx vitest run src/tools/gmail
```

Expected: all existing tests pass (the new mocks are just additions, nothing is removed).

- [ ] **Step 4: Commit**

```bash
git add src/tools/gmail/__tests__/_setup.ts src/tools/gmail/shared.ts
git commit -m "feat(gmail): add filter mock helpers to _setup and shared utilities"
```

---

### Task 2: Implement `list_filters` (TDD)

**Files:**
- Create: `src/tools/gmail/__tests__/list_filters.test.ts`
- Create: `src/tools/gmail/list_filters.ts`

- [ ] **Step 1: Write the failing test**

Create `src/tools/gmail/__tests__/list_filters.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadGmailTools,
  registeredTools,
  mockSettingsFiltersList,
} from './_setup.js';

const SAMPLE_FILTERS = [
  {
    id: 'filter1',
    criteria: { from: 'boss@company.com' },
    action: { addLabelIds: ['STARRED'], removeLabelIds: ['INBOX'] },
  },
  {
    id: 'filter2',
    criteria: { subject: 'newsletter' },
    action: { addLabelIds: [], removeLabelIds: ['UNREAD'] },
  },
];

describe('google_gmail_list_filters', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await loadGmailTools();
  });

  it('returns markdown listing all filters', async () => {
    mockSettingsFiltersList.mockResolvedValue({ data: { filter: SAMPLE_FILTERS } });
    const handler = registeredTools.get('google_gmail_list_filters')!;
    const result = await handler({ response_format: 'markdown' }) as any;

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('filter1');
    expect(result.content[0].text).toContain('boss@company.com');
    expect(result.structuredContent.filters).toHaveLength(2);
    expect(result.structuredContent.filters[0].id).toBe('filter1');
  });

  it('returns "No filters found" when list is empty', async () => {
    mockSettingsFiltersList.mockResolvedValue({ data: { filter: [] } });
    const handler = registeredTools.get('google_gmail_list_filters')!;
    const result = await handler({ response_format: 'markdown' }) as any;

    expect(result.content[0].text).toContain('No filters');
    expect(result.structuredContent.filters).toHaveLength(0);
  });

  it('returns JSON when response_format is json', async () => {
    mockSettingsFiltersList.mockResolvedValue({ data: { filter: SAMPLE_FILTERS } });
    const handler = registeredTools.get('google_gmail_list_filters')!;
    const result = await handler({ response_format: 'json' }) as any;

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.filters).toHaveLength(2);
  });

  it('propagates API errors', async () => {
    mockSettingsFiltersList.mockRejectedValue(new Error('API error'));
    const handler = registeredTools.get('google_gmail_list_filters')!;
    const result = await handler({ response_format: 'markdown' }) as any;

    expect(result.isError).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/tools/gmail/__tests__/list_filters.test.ts
```

Expected: FAIL — `handler` is undefined (tool not yet registered).

- [ ] **Step 3: Implement `list_filters.ts`**

Create `src/tools/gmail/list_filters.ts`:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getGmail, formatFilter } from './shared.js';
import { ResponseFormat } from '../../types.js';
import { handleGoogleError } from '../../utils/errors.js';

export function registerListFilters(server: McpServer): void {
  server.registerTool(
    'google_gmail_list_filters',
    {
      title: 'List Gmail Filters',
      description: `Lists all Gmail filters for the authenticated user. Filters automatically apply actions to incoming mail matching specified criteria.

Returns:
  - filters[].id: Filter ID (use with get/delete/update filter tools)
  - filters[].criteria: Match conditions (from, to, subject, query)
  - filters[].action.addLabelIds: Labels applied when filter matches
  - filters[].action.removeLabelIds: Labels removed when filter matches`,
      inputSchema: z.object({
        response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ response_format }) => {
      try {
        const gmail = getGmail();
        const res = await gmail.users.settings.filters.list({ userId: 'me' });
        const filters = (res.data.filter ?? []).map(formatFilter);

        let text: string;
        if (response_format === ResponseFormat.MARKDOWN) {
          if (filters.length === 0) {
            text = '# Gmail Filters\n\nNo filters found.';
          } else {
            const lines = ['# Gmail Filters', ''];
            for (const f of filters) {
              lines.push(`## Filter \`${f.id}\``);
              lines.push('**Criteria:**');
              if (f.criteria.from)    lines.push(`- From: ${f.criteria.from}`);
              if (f.criteria.to)      lines.push(`- To: ${f.criteria.to}`);
              if (f.criteria.subject) lines.push(`- Subject: ${f.criteria.subject}`);
              if (f.criteria.query)   lines.push(`- Query: ${f.criteria.query}`);
              lines.push('**Action:**');
              if (f.action.addLabelIds.length)    lines.push(`- Add labels: ${f.action.addLabelIds.join(', ')}`);
              if (f.action.removeLabelIds.length) lines.push(`- Remove labels: ${f.action.removeLabelIds.join(', ')}`);
              lines.push('');
            }
            text = lines.join('\n');
          }
        } else {
          text = JSON.stringify({ filters }, null, 2);
        }

        return {
          content: [{ type: 'text', text }],
          structuredContent: { filters },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
```

- [ ] **Step 4: Register the tool in `index.ts`**

In `src/tools/gmail/index.ts`, add at the top:
```typescript
import { registerListFilters } from './list_filters.js';
```
Add at the bottom of `registerGmailTools`:
```typescript
  registerListFilters(server);
```

- [ ] **Step 5: Run the test to confirm it passes**

```bash
npx vitest run src/tools/gmail/__tests__/list_filters.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/tools/gmail/list_filters.ts src/tools/gmail/__tests__/list_filters.test.ts src/tools/gmail/index.ts
git commit -m "feat(gmail): add google_gmail_list_filters tool"
```

---

### Task 3: Implement `get_filter` (TDD)

**Files:**
- Create: `src/tools/gmail/__tests__/get_filter.test.ts`
- Create: `src/tools/gmail/get_filter.ts`

- [ ] **Step 1: Write the failing test**

Create `src/tools/gmail/__tests__/get_filter.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadGmailTools,
  registeredTools,
  mockSettingsFiltersGet,
} from './_setup.js';

const SAMPLE_FILTER = {
  id: 'filter1',
  criteria: { from: 'boss@company.com', subject: 'urgent' },
  action: { addLabelIds: ['STARRED', 'IMPORTANT'], removeLabelIds: ['INBOX'] },
};

describe('google_gmail_get_filter', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await loadGmailTools();
  });

  it('returns a single filter in markdown', async () => {
    mockSettingsFiltersGet.mockResolvedValue({ data: SAMPLE_FILTER });
    const handler = registeredTools.get('google_gmail_get_filter')!;
    const result = await handler({ filter_id: 'filter1', response_format: 'markdown' }) as any;

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('filter1');
    expect(result.content[0].text).toContain('boss@company.com');
    expect(result.content[0].text).toContain('urgent');
    expect(result.structuredContent.filter.id).toBe('filter1');
    expect(result.structuredContent.filter.action.addLabelIds).toContain('STARRED');
  });

  it('returns JSON when response_format is json', async () => {
    mockSettingsFiltersGet.mockResolvedValue({ data: SAMPLE_FILTER });
    const handler = registeredTools.get('google_gmail_get_filter')!;
    const result = await handler({ filter_id: 'filter1', response_format: 'json' }) as any;

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.filter.id).toBe('filter1');
  });

  it('propagates API error for unknown filter ID', async () => {
    mockSettingsFiltersGet.mockRejectedValue(new Error('Filter not found'));
    const handler = registeredTools.get('google_gmail_get_filter')!;
    const result = await handler({ filter_id: 'bad-id', response_format: 'markdown' }) as any;

    expect(result.isError).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/tools/gmail/__tests__/get_filter.test.ts
```

Expected: FAIL — `handler` is undefined.

- [ ] **Step 3: Implement `get_filter.ts`**

Create `src/tools/gmail/get_filter.ts`:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getGmail, formatFilter } from './shared.js';
import { ResponseFormat } from '../../types.js';
import { handleGoogleError } from '../../utils/errors.js';

export function registerGetFilter(server: McpServer): void {
  server.registerTool(
    'google_gmail_get_filter',
    {
      title: 'Get Gmail Filter',
      description: `Retrieves full details for a specific Gmail filter by its ID.

Args:
  - filter_id: Filter ID from google_gmail_list_filters

Returns:
  - filter.id: Filter ID
  - filter.criteria: Match conditions (from, to, subject, query)
  - filter.action.addLabelIds: Labels applied when filter matches
  - filter.action.removeLabelIds: Labels removed when filter matches`,
      inputSchema: z.object({
        filter_id:       z.string().min(1).describe('Filter ID to retrieve.'),
        response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ filter_id, response_format }) => {
      try {
        const gmail = getGmail();
        const res = await gmail.users.settings.filters.get({ userId: 'me', id: filter_id });
        const filter = formatFilter(res.data);

        let text: string;
        if (response_format === ResponseFormat.MARKDOWN) {
          const lines = [`# Filter \`${filter.id}\``, '', '**Criteria:**'];
          if (filter.criteria.from)    lines.push(`- From: ${filter.criteria.from}`);
          if (filter.criteria.to)      lines.push(`- To: ${filter.criteria.to}`);
          if (filter.criteria.subject) lines.push(`- Subject: ${filter.criteria.subject}`);
          if (filter.criteria.query)   lines.push(`- Query: ${filter.criteria.query}`);
          lines.push('', '**Action:**');
          if (filter.action.addLabelIds.length)    lines.push(`- Add labels: ${filter.action.addLabelIds.join(', ')}`);
          if (filter.action.removeLabelIds.length) lines.push(`- Remove labels: ${filter.action.removeLabelIds.join(', ')}`);
          text = lines.join('\n');
        } else {
          text = JSON.stringify({ filter }, null, 2);
        }

        return {
          content: [{ type: 'text', text }],
          structuredContent: { filter },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
```

- [ ] **Step 4: Register in `index.ts`**

Add import:
```typescript
import { registerGetFilter } from './get_filter.js';
```
Add call in `registerGmailTools`:
```typescript
  registerGetFilter(server);
```

- [ ] **Step 5: Run the test to confirm it passes**

```bash
npx vitest run src/tools/gmail/__tests__/get_filter.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/tools/gmail/get_filter.ts src/tools/gmail/__tests__/get_filter.test.ts src/tools/gmail/index.ts
git commit -m "feat(gmail): add google_gmail_get_filter tool"
```

---

## Chunk 2: create_filter + delete_filter + update_filter + wiring

### Task 4: Implement `create_filter` (TDD)

**Files:**
- Create: `src/tools/gmail/__tests__/create_filter.test.ts`
- Create: `src/tools/gmail/create_filter.ts`

- [ ] **Step 1: Write the failing test**

Create `src/tools/gmail/__tests__/create_filter.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadGmailTools,
  registeredTools,
  mockSettingsFiltersCreate,
} from './_setup.js';

describe('google_gmail_create_filter', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await loadGmailTools();
  });

  it('creates a filter with criteria and action, returns new filter', async () => {
    mockSettingsFiltersCreate.mockResolvedValue({
      data: {
        id: 'new-filter',
        criteria: { from: 'promo@store.com' },
        action: { addLabelIds: ['Label_promos'], removeLabelIds: ['INBOX', 'UNREAD'] },
      },
    });
    const handler = registeredTools.get('google_gmail_create_filter')!;
    const result = await handler({
      from: 'promo@store.com',
      add_labels: 'Label_promos',
      skip_inbox: true,
      mark_as_read: true,
    }) as any;

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent.filter.id).toBe('new-filter');
    expect(mockSettingsFiltersCreate).toHaveBeenCalledWith({
      userId: 'me',
      requestBody: {
        criteria: { from: 'promo@store.com' },
        action: {
          addLabelIds: ['Label_promos'],
          removeLabelIds: ['INBOX', 'UNREAD'],
        },
      },
    });
  });

  it('deduplicates label IDs when booleans overlap explicit labels', async () => {
    mockSettingsFiltersCreate.mockResolvedValue({
      data: {
        id: 'new-filter',
        criteria: { from: 'promo@store.com' },
        action: { addLabelIds: ['IMPORTANT'], removeLabelIds: ['INBOX'] },
      },
    });
    const handler = registeredTools.get('google_gmail_create_filter')!;
    await handler({
      from: 'promo@store.com',
      add_labels: 'IMPORTANT',    // explicit
      mark_as_important: true,    // would also add IMPORTANT
      remove_labels: 'INBOX',     // explicit
      skip_inbox: true,           // would also add INBOX
    });

    const call = mockSettingsFiltersCreate.mock.calls[0][0];
    expect(call.requestBody.action.addLabelIds).toEqual(['IMPORTANT']);    // no duplicate
    expect(call.requestBody.action.removeLabelIds).toEqual(['INBOX']);     // no duplicate
  });

  it('returns error when no criteria provided', async () => {
    const handler = registeredTools.get('google_gmail_create_filter')!;
    const result = await handler({ add_labels: 'Label_123' }) as any;

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('criteria');
    expect(mockSettingsFiltersCreate).not.toHaveBeenCalled();
  });

  it('returns error when no action provided', async () => {
    const handler = registeredTools.get('google_gmail_create_filter')!;
    const result = await handler({ from: 'test@example.com' }) as any;

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('action');
    expect(mockSettingsFiltersCreate).not.toHaveBeenCalled();
  });

  it('propagates API errors', async () => {
    mockSettingsFiltersCreate.mockRejectedValue(new Error('Invalid filter'));
    const handler = registeredTools.get('google_gmail_create_filter')!;
    const result = await handler({
      from: 'test@example.com',
      skip_inbox: true,
    }) as any;

    expect(result.isError).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/tools/gmail/__tests__/create_filter.test.ts
```

Expected: FAIL — `handler` is undefined.

- [ ] **Step 3: Implement `create_filter.ts`**

Create `src/tools/gmail/create_filter.ts`:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getGmail, formatFilter, buildCriteria, buildAction } from './shared.js';
import { handleGoogleError } from '../../utils/errors.js';

export function registerCreateFilter(server: McpServer): void {
  server.registerTool(
    'google_gmail_create_filter',
    {
      title: 'Create Gmail Filter',
      description: `Creates a new Gmail filter that automatically applies actions to matching incoming mail.

Args (criteria — at least one required):
  - from: Sender address to match
  - to: Recipient address to match
  - subject: Subject line to match
  - query: Arbitrary Gmail search query

Args (actions — at least one required):
  - add_labels: Comma-separated label IDs to add (e.g. "Label_123,STARRED")
  - remove_labels: Comma-separated label IDs to remove
  - skip_inbox: Archive matching mail (removes INBOX label)
  - mark_as_read: Mark matching mail as read (removes UNREAD label)
  - mark_as_important: Mark matching mail as important (adds IMPORTANT label)

Returns:
  - filter.id: ID of the created filter
  - filter.criteria: Stored match conditions
  - filter.action: Stored label actions`,
      inputSchema: z.object({
        from:              z.string().optional().describe('Sender address to match.'),
        to:                z.string().optional().describe('Recipient address to match.'),
        subject:           z.string().optional().describe('Subject line to match.'),
        query:             z.string().optional().describe('Arbitrary Gmail search query.'),
        add_labels:        z.string().optional().describe('Comma-separated label IDs to add.'),
        remove_labels:     z.string().optional().describe('Comma-separated label IDs to remove.'),
        skip_inbox:        z.boolean().optional().describe('Archive matching mail.'),
        mark_as_read:      z.boolean().optional().describe('Mark matching mail as read.'),
        mark_as_important: z.boolean().optional().describe('Mark matching mail as important.'),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args) => {
      const { from, to, subject, query, add_labels, remove_labels, skip_inbox, mark_as_read, mark_as_important } = args;

      const criteria = buildCriteria({ from, to, subject, query });
      if (Object.keys(criteria).length === 0) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Error: At least one criteria field (from, to, subject, query) must be provided.' }],
        };
      }

      const action = buildAction({ add_labels, remove_labels, skip_inbox, mark_as_read, mark_as_important });
      if (action.addLabelIds.length === 0 && action.removeLabelIds.length === 0) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Error: At least one action must be provided (add_labels, remove_labels, skip_inbox, mark_as_read, or mark_as_important).' }],
        };
      }

      try {
        const gmail = getGmail();
        const res = await gmail.users.settings.filters.create({
          userId: 'me',
          requestBody: { criteria, action },
        });
        const filter = formatFilter(res.data);
        return {
          content: [{ type: 'text', text: `Filter created with ID \`${filter.id}\`.` }],
          structuredContent: { filter },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
```

- [ ] **Step 4: Register in `index.ts`**

Add import:
```typescript
import { registerCreateFilter } from './create_filter.js';
```
Add call in `registerGmailTools`:
```typescript
  registerCreateFilter(server);
```

- [ ] **Step 5: Run the test to confirm it passes**

```bash
npx vitest run src/tools/gmail/__tests__/create_filter.test.ts
```

Expected: 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/tools/gmail/create_filter.ts src/tools/gmail/__tests__/create_filter.test.ts src/tools/gmail/index.ts
git commit -m "feat(gmail): add google_gmail_create_filter tool"
```

---

### Task 5: Implement `delete_filter` (TDD)

**Files:**
- Create: `src/tools/gmail/__tests__/delete_filter.test.ts`
- Create: `src/tools/gmail/delete_filter.ts`

- [ ] **Step 1: Write the failing test**

Create `src/tools/gmail/__tests__/delete_filter.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadGmailTools,
  registeredTools,
  mockSettingsFiltersDelete,
} from './_setup.js';

describe('google_gmail_delete_filter', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await loadGmailTools();
  });

  it('deletes a filter and returns confirmation', async () => {
    mockSettingsFiltersDelete.mockResolvedValue({ data: {} });
    const handler = registeredTools.get('google_gmail_delete_filter')!;
    const result = await handler({ filter_id: 'filter1' }) as any;

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('filter1');
    expect(result.structuredContent.filter_id).toBe('filter1');
    expect(mockSettingsFiltersDelete).toHaveBeenCalledWith({ userId: 'me', id: 'filter1' });
  });

  it('propagates API error', async () => {
    mockSettingsFiltersDelete.mockRejectedValue(new Error('Filter not found'));
    const handler = registeredTools.get('google_gmail_delete_filter')!;
    const result = await handler({ filter_id: 'bad-id' }) as any;

    expect(result.isError).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/tools/gmail/__tests__/delete_filter.test.ts
```

Expected: FAIL — `handler` is undefined.

- [ ] **Step 3: Implement `delete_filter.ts`**

Create `src/tools/gmail/delete_filter.ts`:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getGmail } from './shared.js';
import { handleGoogleError } from '../../utils/errors.js';

export function registerDeleteFilter(server: McpServer): void {
  server.registerTool(
    'google_gmail_delete_filter',
    {
      title: 'Delete Gmail Filter',
      description: `Permanently deletes a Gmail filter by its ID. This action cannot be undone.

Args:
  - filter_id: Filter ID from google_gmail_list_filters

Returns:
  - filter_id: The deleted filter ID`,
      inputSchema: z.object({
        filter_id: z.string().min(1).describe('Filter ID to delete.'),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ filter_id }) => {
      try {
        const gmail = getGmail();
        await gmail.users.settings.filters.delete({ userId: 'me', id: filter_id });
        return {
          content: [{ type: 'text', text: `Filter \`${filter_id}\` deleted.` }],
          structuredContent: { filter_id },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
```

- [ ] **Step 4: Register in `index.ts`**

Add import:
```typescript
import { registerDeleteFilter } from './delete_filter.js';
```
Add call in `registerGmailTools`:
```typescript
  registerDeleteFilter(server);
```

- [ ] **Step 5: Run the test to confirm it passes**

```bash
npx vitest run src/tools/gmail/__tests__/delete_filter.test.ts
```

Expected: 2 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/tools/gmail/delete_filter.ts src/tools/gmail/__tests__/delete_filter.test.ts src/tools/gmail/index.ts
git commit -m "feat(gmail): add google_gmail_delete_filter tool"
```

---

### Task 6: Implement `update_filter` (TDD)

**Files:**
- Create: `src/tools/gmail/__tests__/update_filter.test.ts`
- Create: `src/tools/gmail/update_filter.ts`

- [ ] **Step 1: Write the failing test**

Create `src/tools/gmail/__tests__/update_filter.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadGmailTools,
  registeredTools,
  mockSettingsFiltersDelete,
  mockSettingsFiltersCreate,
} from './_setup.js';

describe('google_gmail_update_filter', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await loadGmailTools();
  });

  it('deletes old filter then creates new one, returns new filter', async () => {
    mockSettingsFiltersDelete.mockResolvedValue({ data: {} });
    mockSettingsFiltersCreate.mockResolvedValue({
      data: {
        id: 'new-filter-id',
        criteria: { from: 'updated@example.com' },
        action: { addLabelIds: [], removeLabelIds: ['INBOX'] },
      },
    });
    const handler = registeredTools.get('google_gmail_update_filter')!;
    const result = await handler({
      filter_id: 'old-filter-id',
      from: 'updated@example.com',
      skip_inbox: true,
    }) as any;

    expect(result.isError).toBeUndefined();
    expect(mockSettingsFiltersDelete).toHaveBeenCalledWith({ userId: 'me', id: 'old-filter-id' });
    expect(mockSettingsFiltersCreate).toHaveBeenCalled();
    expect(result.structuredContent.filter.id).toBe('new-filter-id');
    expect(result.content[0].text).toContain('new-filter-id');
  });

  it('does not call create if delete fails', async () => {
    mockSettingsFiltersDelete.mockRejectedValue(new Error('Filter not found'));
    const handler = registeredTools.get('google_gmail_update_filter')!;
    const result = await handler({
      filter_id: 'bad-id',
      from: 'test@example.com',
      skip_inbox: true,
    }) as any;

    expect(result.isError).toBe(true);
    expect(mockSettingsFiltersCreate).not.toHaveBeenCalled();
  });

  it('returns error (no API calls) when no criteria provided', async () => {
    const handler = registeredTools.get('google_gmail_update_filter')!;
    const result = await handler({ filter_id: 'filter1', skip_inbox: true }) as any;

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('criteria');
    expect(mockSettingsFiltersDelete).not.toHaveBeenCalled();
    expect(mockSettingsFiltersCreate).not.toHaveBeenCalled();
  });

  it('returns error (no API calls) when no action provided', async () => {
    const handler = registeredTools.get('google_gmail_update_filter')!;
    const result = await handler({ filter_id: 'filter1', from: 'test@example.com' }) as any;

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('action');
    expect(mockSettingsFiltersDelete).not.toHaveBeenCalled();
    expect(mockSettingsFiltersCreate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx vitest run src/tools/gmail/__tests__/update_filter.test.ts
```

Expected: FAIL — `handler` is undefined.

- [ ] **Step 3: Implement `update_filter.ts`**

Create `src/tools/gmail/update_filter.ts`:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getGmail, formatFilter, buildCriteria, buildAction } from './shared.js';
import { handleGoogleError } from '../../utils/errors.js';

export function registerUpdateFilter(server: McpServer): void {
  server.registerTool(
    'google_gmail_update_filter',
    {
      title: 'Update Gmail Filter',
      description: `Replaces an existing Gmail filter by deleting it and creating a new one with updated settings.

⚠️ Not atomic: if create fails after delete, the original filter is lost. If delete fails, create is not attempted.

Args:
  - filter_id: ID of the filter to replace (from google_gmail_list_filters)

Args (criteria — at least one required):
  - from: Sender address to match
  - to: Recipient address to match
  - subject: Subject line to match
  - query: Arbitrary Gmail search query

Args (actions — at least one required):
  - add_labels: Comma-separated label IDs to add
  - remove_labels: Comma-separated label IDs to remove
  - skip_inbox: Archive matching mail (removes INBOX label)
  - mark_as_read: Mark matching mail as read (removes UNREAD label)
  - mark_as_important: Mark matching mail as important (adds IMPORTANT label)

Returns:
  - filter.id: ID of the newly created filter (different from original)`,
      inputSchema: z.object({
        filter_id:         z.string().min(1).describe('Filter ID to replace.'),
        from:              z.string().optional(),
        to:                z.string().optional(),
        subject:           z.string().optional(),
        query:             z.string().optional(),
        add_labels:        z.string().optional(),
        remove_labels:     z.string().optional(),
        skip_inbox:        z.boolean().optional(),
        mark_as_read:      z.boolean().optional(),
        mark_as_important: z.boolean().optional(),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async (args) => {
      const { filter_id, from, to, subject, query, add_labels, remove_labels, skip_inbox, mark_as_read, mark_as_important } = args;

      const criteria = buildCriteria({ from, to, subject, query });
      if (Object.keys(criteria).length === 0) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Error: At least one criteria field (from, to, subject, query) must be provided.' }],
        };
      }

      const action = buildAction({ add_labels, remove_labels, skip_inbox, mark_as_read, mark_as_important });
      if (action.addLabelIds.length === 0 && action.removeLabelIds.length === 0) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Error: At least one action must be provided (add_labels, remove_labels, skip_inbox, mark_as_read, or mark_as_important).' }],
        };
      }

      try {
        const gmail = getGmail();
        await gmail.users.settings.filters.delete({ userId: 'me', id: filter_id });
        const res = await gmail.users.settings.filters.create({
          userId: 'me',
          requestBody: { criteria, action },
        });
        const filter = formatFilter(res.data);
        return {
          content: [{ type: 'text', text: `Filter updated. New filter ID: \`${filter.id}\`.` }],
          structuredContent: { filter },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
```

- [ ] **Step 4: Register in `index.ts`**

Add import:
```typescript
import { registerUpdateFilter } from './update_filter.js';
```
Add call in `registerGmailTools`:
```typescript
  registerUpdateFilter(server);
```

- [ ] **Step 5: Run the test to confirm it passes**

```bash
npx vitest run src/tools/gmail/__tests__/update_filter.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/tools/gmail/update_filter.ts src/tools/gmail/__tests__/update_filter.test.ts src/tools/gmail/index.ts
git commit -m "feat(gmail): add google_gmail_update_filter tool"
```

---

### Task 7: Run full test suite + lint

- [ ] **Step 1: Run the full Gmail test suite**

```bash
npx vitest run src/tools/gmail
```

Expected: all tests PASS (existing + all 5 new tool test files).

- [ ] **Step 2: Run the full project test suite**

```bash
npm run test
```

Expected: all tests PASS with no failures.

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Build to confirm TypeScript compilation**

```bash
npm run build
```

Expected: compiles without errors.

- [ ] **Step 5: Commit any lint fixes (if needed)**

```bash
git add -A
git commit -m "fix(gmail): address lint issues in filter tools"
```

(Skip this step if lint/build passed clean.)
