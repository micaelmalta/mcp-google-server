import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getPeople, PERSON_FIELDS, DIRECTORY_SOURCES, extractPerson, formatPersonMarkdown } from './shared.js';
import { ResponseFormat } from '../../types.js';
import { handleGoogleError } from '../../utils/errors.js';
import { truncateIfNeeded } from '../../utils/format.js';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../constants.js';

export function registerDirectorySearch(server: McpServer): void {
  server.registerTool(
    'google_directory_search',
    {
      title: 'Search Directory People',
      description: `Searches your Google Workspace domain directory for people by name.

Uses a prefix query to match against names, emails, and other person fields in your organization's directory.

Args:
  - query: Search term (name prefix, e.g. "Ken", "Ken Little")
  - limit: Max results (1-${MAX_PAGE_SIZE}, default: ${DEFAULT_PAGE_SIZE})
  - page_token: Pagination token from previous call
  - response_format: 'markdown' or 'json'

Returns:
  - people[].name: Full display name
  - people[].emails: Email addresses
  - people[].phones: Phone numbers
  - people[].organization: Company/org name
  - people[].title: Job title
  - next_page_token: Token for next page

Note: Requires Google Workspace account. Personal Gmail accounts cannot search a domain directory.`,
      inputSchema: z.object({
        query: z.string().min(1).describe('Name or prefix to search for.'),
        limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
        page_token: z.string().optional(),
        response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ query, limit, page_token, response_format }) => {
      try {
        const people = getPeople();
        const res = await people.people.searchDirectoryPeople({
          query,
          readMask: PERSON_FIELDS,
          sources: [...DIRECTORY_SOURCES],
          pageSize: limit,
          pageToken: page_token,
        });

        const results = (res.data.people ?? []).map((p) => extractPerson(p as Record<string, unknown>));
        const nextPageToken = res.data.nextPageToken ?? undefined;

        let text: string;
        if (response_format === ResponseFormat.MARKDOWN) {
          if (results.length === 0) {
            text = `No directory results for "${query}".`;
          } else {
            const lines = [`# Directory Search: "${query}" (${results.length} results)`, ''];
            for (const p of results) {
              lines.push(formatPersonMarkdown(p));
              lines.push('');
            }
            if (nextPageToken) lines.push(`*Use page_token="${nextPageToken}" for next page.*`);
            text = lines.join('\n');
          }
        } else {
          text = JSON.stringify({ people: results, next_page_token: nextPageToken, has_more: !!nextPageToken }, null, 2);
        }

        return {
          content: [{ type: 'text', text: truncateIfNeeded(text) }],
          structuredContent: { people: results, next_page_token: nextPageToken, has_more: !!nextPageToken },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
