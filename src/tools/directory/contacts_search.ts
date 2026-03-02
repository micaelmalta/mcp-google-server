import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getPeople, extractPerson, formatPersonMarkdown } from './shared.js';
import { ResponseFormat } from '../../types.js';
import { handleGoogleError } from '../../utils/errors.js';
import { truncateIfNeeded } from '../../utils/format.js';

export function registerContactsSearch(server: McpServer): void {
  server.registerTool(
    'google_contacts_search',
    {
      title: 'Search Google Contacts',
      description: `Searches the authenticated user's personal Google contacts by name.

This searches your personal contacts. Use google_directory_search for organization-wide lookups.

Args:
  - query: Name or prefix to search for
  - limit: Max results (1-30, default: 10)
  - response_format: 'markdown' or 'json'

Returns:
  - contacts[].name: Full display name
  - contacts[].emails: Email addresses
  - contacts[].phones: Phone numbers
  - contacts[].organization: Company/org name
  - contacts[].title: Job title`,
      inputSchema: z.object({
        query: z.string().min(1).describe('Name or prefix to search for.'),
        limit: z.number().int().min(1).max(30).default(10),
        response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ query, limit, response_format }) => {
      try {
        const people = getPeople();
        const res = await people.people.searchContacts({
          query,
          readMask: 'names,emailAddresses,phoneNumbers,organizations,photos,biographies',
          pageSize: limit,
        });

        const contacts = (res.data.results ?? [])
          .map((r) => r.person)
          .filter(Boolean)
          .map((p) => extractPerson(p as Record<string, unknown>));

        let text: string;
        if (response_format === ResponseFormat.MARKDOWN) {
          if (contacts.length === 0) {
            text = `No contacts found matching "${query}".`;
          } else {
            const lines = [`# Contact Search: "${query}" (${contacts.length} results)`, ''];
            for (const p of contacts) {
              lines.push(formatPersonMarkdown(p));
              lines.push('');
            }
            text = lines.join('\n');
          }
        } else {
          text = JSON.stringify({ contacts }, null, 2);
        }

        return {
          content: [{ type: 'text', text: truncateIfNeeded(text) }],
          structuredContent: { contacts },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
