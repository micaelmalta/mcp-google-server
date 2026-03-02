import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getPeople, PERSON_FIELDS, DIRECTORY_SOURCES, extractPerson, formatPersonMarkdown } from './shared.js';
import { ResponseFormat } from '../../types.js';
import { handleGoogleError } from '../../utils/errors.js';
import { truncateIfNeeded } from '../../utils/format.js';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../constants.js';

export function registerDirectoryList(server: McpServer): void {
  server.registerTool(
    'google_directory_list',
    {
      title: 'List Directory People',
      description: `Lists people in your Google Workspace domain directory.

Retrieves all profiles in your organization's directory with pagination support.

Args:
  - limit: Max results per page (1-${MAX_PAGE_SIZE}, default: ${DEFAULT_PAGE_SIZE})
  - page_token: Pagination token from previous call
  - response_format: 'markdown' or 'json'

Returns:
  - people[].name: Full display name
  - people[].emails: Email addresses
  - people[].phones: Phone numbers
  - people[].organization: Company/org name
  - people[].title: Job title
  - next_page_token: Token for next page

Note: Requires Google Workspace account.`,
      inputSchema: z.object({
        limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
        page_token: z.string().optional(),
        response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ limit, page_token, response_format }) => {
      try {
        const people = getPeople();
        const res = await people.people.listDirectoryPeople({
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
            text = 'No people found in directory.';
          } else {
            const lines = [`# Directory (${results.length} people)`, ''];
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
