import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getPeople, extractPerson, formatPersonMarkdown } from './shared.js';
import { ResponseFormat } from '../../types.js';
import { handleGoogleError } from '../../utils/errors.js';
import { truncateIfNeeded } from '../../utils/format.js';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../../constants.js';

export function registerContactsList(server: McpServer): void {
  server.registerTool(
    'google_contacts_list',
    {
      title: 'List Google Contacts',
      description: `Lists the authenticated user's personal Google contacts.

This returns your personal contacts (not the organization directory). Use google_directory_search for organization-wide lookups.

Args:
  - limit: Max results per page (1-${MAX_PAGE_SIZE}, default: ${DEFAULT_PAGE_SIZE})
  - page_token: Pagination token from previous call
  - sort_order: Sort contacts by 'last_modified' or 'last_name' (default: last_modified)
  - response_format: 'markdown' or 'json'

Returns:
  - contacts[].name: Full display name
  - contacts[].emails: Email addresses
  - contacts[].phones: Phone numbers
  - contacts[].organization: Company/org name
  - contacts[].title: Job title
  - next_page_token: Token for next page`,
      inputSchema: z.object({
        limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
        page_token: z.string().optional(),
        sort_order: z.enum(['last_modified', 'last_name']).default('last_modified').describe('Sort order for contacts.'),
        response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ limit, page_token, sort_order, response_format }) => {
      try {
        const people = getPeople();
        const sortOrder = sort_order === 'last_name'
          ? 'LAST_NAME_ASCENDING'
          : 'LAST_MODIFIED_DESCENDING';

        const res = await people.people.connections.list({
          resourceName: 'people/me',
          personFields: 'names,emailAddresses,phoneNumbers,organizations,photos,biographies',
          pageSize: limit,
          pageToken: page_token,
          sortOrder,
        });

        const contacts = (res.data.connections ?? []).map((p) => extractPerson(p as Record<string, unknown>));
        const nextPageToken = res.data.nextPageToken ?? undefined;
        const totalItems = res.data.totalItems ?? contacts.length;

        let text: string;
        if (response_format === ResponseFormat.MARKDOWN) {
          if (contacts.length === 0) {
            text = 'No contacts found.';
          } else {
            const lines = [`# Contacts (${contacts.length} of ${totalItems})`, ''];
            for (const p of contacts) {
              lines.push(formatPersonMarkdown(p));
              lines.push('');
            }
            if (nextPageToken) lines.push(`*Use page_token="${nextPageToken}" for next page.*`);
            text = lines.join('\n');
          }
        } else {
          text = JSON.stringify({ contacts, total: totalItems, next_page_token: nextPageToken, has_more: !!nextPageToken }, null, 2);
        }

        return {
          content: [{ type: 'text', text: truncateIfNeeded(text) }],
          structuredContent: { contacts, total: totalItems, next_page_token: nextPageToken, has_more: !!nextPageToken },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
