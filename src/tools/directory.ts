import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { google } from 'googleapis';
import { z } from 'zod';
import { requireAuth } from '../auth/oauth.js';
import { ResponseFormat } from '../types.js';
import { handleGoogleError } from '../utils/errors.js';
import { truncateIfNeeded } from '../utils/format.js';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../constants.js';

function getPeople() {
  const auth = requireAuth();
  return google.people({ version: 'v1', auth });
}

/** Common person fields to request from the People API. */
const PERSON_FIELDS = 'names,emailAddresses,phoneNumbers,organizations,photos,biographies';

/** Directory sources for workspace domain queries. */
const DIRECTORY_SOURCES = ['DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE'] as const;

export interface PersonEntry {
  resource_name: string;
  name: string;
  emails: string[];
  phones: string[];
  organization: string;
  title: string;
  photo_url: string;
  [key: string]: unknown;
}

export function extractPerson(person: Record<string, unknown>): PersonEntry {
  const names = person.names as Array<{ displayName?: string }> | undefined;
  const emails = person.emailAddresses as Array<{ value?: string }> | undefined;
  const phones = person.phoneNumbers as Array<{ value?: string }> | undefined;
  const orgs = person.organizations as Array<{ name?: string; title?: string }> | undefined;
  const photos = person.photos as Array<{ url?: string }> | undefined;

  return {
    resource_name: (person.resourceName as string) ?? '',
    name: names?.[0]?.displayName ?? '',
    emails: (emails ?? []).map((e) => e.value ?? '').filter(Boolean),
    phones: (phones ?? []).map((p) => p.value ?? '').filter(Boolean),
    organization: orgs?.[0]?.name ?? '',
    title: orgs?.[0]?.title ?? '',
    photo_url: photos?.[0]?.url ?? '',
  };
}

export function formatPersonMarkdown(p: PersonEntry): string {
  const lines = [`### ${p.name || '(No name)'}`];
  if (p.emails.length) lines.push(`- **Email**: ${p.emails.join(', ')}`);
  if (p.phones.length) lines.push(`- **Phone**: ${p.phones.join(', ')}`);
  if (p.title || p.organization) {
    const parts = [p.title, p.organization].filter(Boolean);
    lines.push(`- **Role**: ${parts.join(' at ')}`);
  }
  return lines.join('\n');
}

export function registerDirectoryTools(server: McpServer): void {
  // ─── google_directory_search ──────────────────────────────────────────────
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

  // ─── google_directory_list ────────────────────────────────────────────────
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

  // ─── google_contacts_list ─────────────────────────────────────────────────
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
          personFields: PERSON_FIELDS,
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

  // ─── google_contacts_search ───────────────────────────────────────────────
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
          readMask: PERSON_FIELDS,
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
