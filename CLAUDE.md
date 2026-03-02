# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build          # Compile TypeScript → dist/
npm run dev            # Watch mode (tsx)
npm run test           # Run all tests once
npm run test:watch     # Test watch mode
npm run test:coverage  # Tests + coverage report (HTML/JSON in coverage/)
npm run lint           # ESLint check
npm run lint:fix       # ESLint auto-fix

# Run a single test file
npx vitest run src/tools/calendar/__tests__/list_events.test.ts

# Run tests by name pattern
npx vitest run --grep "google_auth_start"
```

**Requirements:** Node.js >=24, env vars `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`.

## Architecture

Entry point is `src/index.ts`, which creates a `McpServer` (stdio transport) and registers all tool groups:

```
src/
├── index.ts            # McpServer creation + registerXxxTools() calls
├── types.ts            # ResponseFormat enum, PaginatedResult<T>
├── constants.ts        # Env vars, OAuth scopes, CHARACTER_LIMIT (25k), DEFAULT_PAGE_SIZE
├── auth/
│   ├── oauth.ts        # OAuth2 singleton: getOAuthClient(), requireAuth(), saveTokens()
│   └── callback.ts     # Local HTTP server on port 8080 for OAuth redirect
├── tools/
│   ├── auth/           # google_auth_start, google_auth_status, google_auth_revoke
│   ├── calendar/       # 9 tools (list/get/create/update/approve/decline/delete events, freebusy)
│   ├── gmail/          # 8 tools (list messages/threads, get, send, reply, labels)
│   ├── drive/          # 8 tools (list, search, get, create folder, move, delete, share, permissions)
│   ├── docs/           # 3 tools (create, get, append text)
│   ├── sheets/         # 7 tools (create, get/update/append values, add/delete sheet)
│   ├── slides/         # 3 tools (create, get, append slides)
│   └── directory/      # 4 tools (list/search contacts, directory search)
└── utils/
    ├── errors.ts       # handleGoogleError(): maps API errors to user-friendly strings
    └── format.ts       # truncateIfNeeded(), formatDate(), base64url, buildRawEmail()
```

## Key Patterns

### Tool Registration

Each tool lives in its own file and exports a `registerXxx(server: McpServer)` function. The group `index.ts` collects them:

```typescript
// tools/calendar/list_events.ts
export function registerListEvents(server: McpServer): void {
  server.registerTool('google_calendar_list_events', {
    inputSchema: z.object({ calendar_id: z.string().default('primary') }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false }
  }, async (args) => {
    try {
      const cal = getCalendar();        // calls requireAuth() internally
      const res = await cal.events.list(...);
      return {
        content: [{ type: 'text', text: '...' }],       // markdown for UI
        structuredContent: { items: [...] }              // JSON for programmatic use
      };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
    }
  });
}
```

- All inputs validated with Zod `.strict()` (rejects unknown properties)
- All tools return both `content` (markdown) and `structuredContent` (JSON)
- `structuredContent` interfaces need `[key: string]: unknown` index signature
- Errors always use `handleGoogleError()` and return `isError: true`

### Auth

`getOAuthClient()` returns a singleton `OAuth2Client`. Tokens are loaded from `~/.google-mcp-tokens.json` on first call and auto-saved on refresh via `client.on('tokens', saveTokens)`. `requireAuth()` throws a descriptive error if no tokens are present—all tools call this via their `getXxx()` API factory in `shared.ts`.

### Per-Group `shared.ts`

Each tool group has a `shared.ts` with API client factories and formatting helpers:

```typescript
// tools/calendar/shared.ts
export function getCalendar() {
  const auth = requireAuth();
  return google.calendar({ version: 'v3', auth });
}
```

### Testing

Tests use Vitest with a dynamic mock-loading pattern. Each group's `__tests__/_setup.ts` defines hoisted `vi.mock()` calls and exports a `registeredTools` map + `loadXxxTools()` function:

```typescript
// __tests__/_setup.ts
const _mocks = vi.hoisted(() => ({ mockListCalendars: vi.fn() }));
vi.mock('../../../auth/oauth.js', () => ({ requireAuth: () => ({}) }));

export const registeredTools = new Map<string, ToolHandler>();
const mockServer = { registerTool: (name, _opts, handler) => registeredTools.set(name, handler) };

export async function loadCalendarTools() {
  const { registerCalendarTools } = await import('../index.js');
  registerCalendarTools(mockServer as McpServer);
}
```

Tests call `loadCalendarTools()` in `beforeEach`, then invoke handlers directly from `registeredTools.get('tool_name')`.
