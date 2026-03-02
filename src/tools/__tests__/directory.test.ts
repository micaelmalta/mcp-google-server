import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractPerson, formatPersonMarkdown, type PersonEntry } from '../directory.js';

// ─── extractPerson ────────────────────────────────────────────────────────────

describe('extractPerson', () => {
  it('extracts all fields from a fully-populated person object', () => {
    const person = {
      resourceName: 'people/123',
      names: [{ displayName: 'Jane Doe' }],
      emailAddresses: [{ value: 'jane@example.com' }, { value: 'jane.doe@work.com' }],
      phoneNumbers: [{ value: '+1-555-0100' }],
      organizations: [{ name: 'Acme Corp', title: 'Engineer' }],
      photos: [{ url: 'https://photo.example.com/jane.jpg' }],
    };

    expect(extractPerson(person)).toEqual({
      resource_name: 'people/123',
      name: 'Jane Doe',
      emails: ['jane@example.com', 'jane.doe@work.com'],
      phones: ['+1-555-0100'],
      organization: 'Acme Corp',
      title: 'Engineer',
      photo_url: 'https://photo.example.com/jane.jpg',
    });
  });

  it('returns empty defaults for a minimal person object', () => {
    expect(extractPerson({})).toEqual({
      resource_name: '',
      name: '',
      emails: [],
      phones: [],
      organization: '',
      title: '',
      photo_url: '',
    });
  });

  it('filters out empty email/phone values', () => {
    const person = {
      emailAddresses: [{ value: '' }, { value: 'a@b.com' }, { value: undefined }],
      phoneNumbers: [{ value: '' }, { value: '555-1234' }],
    };

    const result = extractPerson(person as Record<string, unknown>);
    expect(result.emails).toEqual(['a@b.com']);
    expect(result.phones).toEqual(['555-1234']);
  });

  it('handles empty arrays for all list fields', () => {
    const person = {
      names: [],
      emailAddresses: [],
      phoneNumbers: [],
      organizations: [],
      photos: [],
    };

    const result = extractPerson(person as Record<string, unknown>);
    expect(result.name).toBe('');
    expect(result.emails).toEqual([]);
    expect(result.phones).toEqual([]);
    expect(result.organization).toBe('');
    expect(result.title).toBe('');
    expect(result.photo_url).toBe('');
  });

  it('uses first name/org/photo when multiple exist', () => {
    const person = {
      names: [{ displayName: 'Primary' }, { displayName: 'Secondary' }],
      organizations: [{ name: 'First Org', title: 'CTO' }, { name: 'Second Org', title: 'Advisor' }],
      photos: [{ url: 'https://a.com/1.jpg' }, { url: 'https://a.com/2.jpg' }],
    };

    const result = extractPerson(person as Record<string, unknown>);
    expect(result.name).toBe('Primary');
    expect(result.organization).toBe('First Org');
    expect(result.title).toBe('CTO');
    expect(result.photo_url).toBe('https://a.com/1.jpg');
  });
});

// ─── formatPersonMarkdown ─────────────────────────────────────────────────────

describe('formatPersonMarkdown', () => {
  const basePerson: PersonEntry = {
    resource_name: 'people/1',
    name: 'Alice Smith',
    emails: ['alice@example.com'],
    phones: ['+1-555-0101'],
    organization: 'Widgets Inc',
    title: 'Director',
    photo_url: 'https://photo.example.com/alice.jpg',
  };

  it('formats a full person entry', () => {
    const md = formatPersonMarkdown(basePerson);
    expect(md).toBe(
      '### Alice Smith\n' +
      '- **Email**: alice@example.com\n' +
      '- **Phone**: +1-555-0101\n' +
      '- **Role**: Director at Widgets Inc'
    );
  });

  it('shows (No name) when name is empty', () => {
    const md = formatPersonMarkdown({ ...basePerson, name: '' });
    expect(md).toContain('### (No name)');
  });

  it('omits email line when no emails', () => {
    const md = formatPersonMarkdown({ ...basePerson, emails: [] });
    expect(md).not.toContain('**Email**');
  });

  it('omits phone line when no phones', () => {
    const md = formatPersonMarkdown({ ...basePerson, phones: [] });
    expect(md).not.toContain('**Phone**');
  });

  it('joins multiple emails with comma', () => {
    const md = formatPersonMarkdown({ ...basePerson, emails: ['a@b.com', 'c@d.com'] });
    expect(md).toContain('- **Email**: a@b.com, c@d.com');
  });

  it('shows only title when no organization', () => {
    const md = formatPersonMarkdown({ ...basePerson, organization: '' });
    expect(md).toContain('- **Role**: Director');
    expect(md).not.toContain(' at ');
  });

  it('shows only organization when no title', () => {
    const md = formatPersonMarkdown({ ...basePerson, title: '' });
    expect(md).toContain('- **Role**: Widgets Inc');
  });

  it('omits role line when both title and org are empty', () => {
    const md = formatPersonMarkdown({ ...basePerson, title: '', organization: '' });
    expect(md).not.toContain('**Role**');
  });
});

// ─── registerDirectoryTools (integration via McpServer mock) ──────────────────

const mockSearchDirectoryPeople = vi.fn();
const mockListDirectoryPeople = vi.fn();
const mockConnectionsList = vi.fn();
const mockSearchContacts = vi.fn();

vi.mock('googleapis', () => ({
  google: {
    people: () => ({
      people: {
        searchDirectoryPeople: mockSearchDirectoryPeople,
        listDirectoryPeople: mockListDirectoryPeople,
        searchContacts: mockSearchContacts,
        connections: { list: mockConnectionsList },
      },
    }),
  },
}));

vi.mock('../../auth/oauth.js', () => ({
  requireAuth: () => ({}),
}));

// Capture tool handlers registered on the mock server
type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;
const registeredTools = new Map<string, ToolHandler>();

const mockServer = {
  registerTool: (name: string, _opts: unknown, handler: ToolHandler) => {
    registeredTools.set(name, handler);
  },
} as unknown;

async function loadTools() {
  if (registeredTools.size > 0) return;
  const { registerDirectoryTools } = await import('../directory.js');
  registerDirectoryTools(mockServer as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer);
}

function makePerson(overrides: Record<string, unknown> = {}) {
  return {
    resourceName: 'people/100',
    names: [{ displayName: 'Test User' }],
    emailAddresses: [{ value: 'test@example.com' }],
    phoneNumbers: [{ value: '+1-555-0000' }],
    organizations: [{ name: 'TestCo', title: 'Dev' }],
    photos: [{ url: 'https://photo.example.com/test.jpg' }],
    ...overrides,
  };
}

describe('google_directory_search tool', () => {
  beforeEach(async () => {
    await loadTools();
    vi.clearAllMocks();
  });

  it('returns markdown for matched people', async () => {
    mockSearchDirectoryPeople.mockResolvedValue({
      data: { people: [makePerson()], nextPageToken: undefined },
    });

    const handler = registeredTools.get('google_directory_search')!;
    const result = (await handler({ query: 'Test', limit: 20, response_format: 'markdown' })) as {
      content: { type: string; text: string }[];
      structuredContent: { people: PersonEntry[] };
    };

    expect(result.content[0].text).toContain('# Directory Search: "Test"');
    expect(result.content[0].text).toContain('### Test User');
    expect(result.structuredContent.people).toHaveLength(1);
    expect(result.structuredContent.people[0].name).toBe('Test User');
  });

  it('returns no-results markdown when empty', async () => {
    mockSearchDirectoryPeople.mockResolvedValue({
      data: { people: [], nextPageToken: undefined },
    });

    const handler = registeredTools.get('google_directory_search')!;
    const result = (await handler({ query: 'Nobody', limit: 20, response_format: 'markdown' })) as {
      content: { type: string; text: string }[];
    };

    expect(result.content[0].text).toContain('No directory results for "Nobody"');
  });

  it('returns JSON when response_format is json', async () => {
    mockSearchDirectoryPeople.mockResolvedValue({
      data: { people: [makePerson()], nextPageToken: 'abc' },
    });

    const handler = registeredTools.get('google_directory_search')!;
    const result = (await handler({ query: 'Test', limit: 20, response_format: 'json' })) as {
      content: { type: string; text: string }[];
      structuredContent: { next_page_token: string; has_more: boolean };
    };

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.people).toHaveLength(1);
    expect(parsed.next_page_token).toBe('abc');
    expect(parsed.has_more).toBe(true);
    expect(result.structuredContent.next_page_token).toBe('abc');
    expect(result.structuredContent.has_more).toBe(true);
  });

  it('includes page_token hint when more results exist', async () => {
    mockSearchDirectoryPeople.mockResolvedValue({
      data: { people: [makePerson()], nextPageToken: 'next123' },
    });

    const handler = registeredTools.get('google_directory_search')!;
    const result = (await handler({ query: 'Test', limit: 20, response_format: 'markdown' })) as {
      content: { type: string; text: string }[];
    };

    expect(result.content[0].text).toContain('page_token="next123"');
  });

  it('returns error on API failure', async () => {
    mockSearchDirectoryPeople.mockRejectedValue(new Error('API quota exceeded'));

    const handler = registeredTools.get('google_directory_search')!;
    const result = (await handler({ query: 'Test', limit: 20, response_format: 'markdown' })) as {
      isError: boolean;
      content: { type: string; text: string }[];
    };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('quota');
  });
});

describe('google_directory_list tool', () => {
  beforeEach(async () => {
    await loadTools();
    vi.clearAllMocks();
  });

  it('returns markdown list of directory people', async () => {
    mockListDirectoryPeople.mockResolvedValue({
      data: { people: [makePerson(), makePerson({ names: [{ displayName: 'User Two' }] })], nextPageToken: undefined },
    });

    const handler = registeredTools.get('google_directory_list')!;
    const result = (await handler({ limit: 20, response_format: 'markdown' })) as {
      content: { type: string; text: string }[];
      structuredContent: { people: PersonEntry[] };
    };

    expect(result.content[0].text).toContain('# Directory (2 people)');
    expect(result.content[0].text).toContain('### Test User');
    expect(result.content[0].text).toContain('### User Two');
    expect(result.structuredContent.people).toHaveLength(2);
  });

  it('returns empty-state markdown', async () => {
    mockListDirectoryPeople.mockResolvedValue({
      data: { people: [], nextPageToken: undefined },
    });

    const handler = registeredTools.get('google_directory_list')!;
    const result = (await handler({ limit: 20, response_format: 'markdown' })) as {
      content: { type: string; text: string }[];
    };

    expect(result.content[0].text).toBe('No people found in directory.');
  });

  it('returns error on API failure', async () => {
    mockListDirectoryPeople.mockRejectedValue(new Error('forbidden'));

    const handler = registeredTools.get('google_directory_list')!;
    const result = (await handler({ limit: 20, response_format: 'markdown' })) as {
      isError: boolean;
      content: { type: string; text: string }[];
    };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Insufficient permissions');
  });
});

describe('google_contacts_list tool', () => {
  beforeEach(async () => {
    await loadTools();
    vi.clearAllMocks();
  });

  it('returns markdown list of contacts', async () => {
    mockConnectionsList.mockResolvedValue({
      data: { connections: [makePerson()], nextPageToken: undefined, totalItems: 1 },
    });

    const handler = registeredTools.get('google_contacts_list')!;
    const result = (await handler({ limit: 20, sort_order: 'last_modified', response_format: 'markdown' })) as {
      content: { type: string; text: string }[];
      structuredContent: { contacts: PersonEntry[]; total: number };
    };

    expect(result.content[0].text).toContain('# Contacts (1 of 1)');
    expect(result.structuredContent.contacts).toHaveLength(1);
    expect(result.structuredContent.total).toBe(1);
  });

  it('passes LAST_NAME_ASCENDING sort when sort_order is last_name', async () => {
    mockConnectionsList.mockResolvedValue({
      data: { connections: [], nextPageToken: undefined, totalItems: 0 },
    });

    const handler = registeredTools.get('google_contacts_list')!;
    await handler({ limit: 10, sort_order: 'last_name', response_format: 'json' });

    expect(mockConnectionsList).toHaveBeenCalledWith(
      expect.objectContaining({ sortOrder: 'LAST_NAME_ASCENDING' }),
    );
  });

  it('passes LAST_MODIFIED_DESCENDING sort by default', async () => {
    mockConnectionsList.mockResolvedValue({
      data: { connections: [], nextPageToken: undefined, totalItems: 0 },
    });

    const handler = registeredTools.get('google_contacts_list')!;
    await handler({ limit: 10, sort_order: 'last_modified', response_format: 'json' });

    expect(mockConnectionsList).toHaveBeenCalledWith(
      expect.objectContaining({ sortOrder: 'LAST_MODIFIED_DESCENDING' }),
    );
  });

  it('returns empty-state markdown', async () => {
    mockConnectionsList.mockResolvedValue({
      data: { connections: [], nextPageToken: undefined, totalItems: 0 },
    });

    const handler = registeredTools.get('google_contacts_list')!;
    const result = (await handler({ limit: 20, sort_order: 'last_modified', response_format: 'markdown' })) as {
      content: { type: string; text: string }[];
    };

    expect(result.content[0].text).toBe('No contacts found.');
  });

  it('returns JSON format with total count', async () => {
    mockConnectionsList.mockResolvedValue({
      data: { connections: [makePerson()], nextPageToken: 'pg2', totalItems: 50 },
    });

    const handler = registeredTools.get('google_contacts_list')!;
    const result = (await handler({ limit: 20, sort_order: 'last_modified', response_format: 'json' })) as {
      content: { type: string; text: string }[];
      structuredContent: { total: number; has_more: boolean };
    };

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.total).toBe(50);
    expect(parsed.has_more).toBe(true);
    expect(result.structuredContent.total).toBe(50);
  });
});

describe('google_contacts_search tool', () => {
  beforeEach(async () => {
    await loadTools();
    vi.clearAllMocks();
  });

  it('returns markdown for matched contacts', async () => {
    mockSearchContacts.mockResolvedValue({
      data: { results: [{ person: makePerson() }] },
    });

    const handler = registeredTools.get('google_contacts_search')!;
    const result = (await handler({ query: 'Test', limit: 10, response_format: 'markdown' })) as {
      content: { type: string; text: string }[];
      structuredContent: { contacts: PersonEntry[] };
    };

    expect(result.content[0].text).toContain('# Contact Search: "Test"');
    expect(result.content[0].text).toContain('### Test User');
    expect(result.structuredContent.contacts).toHaveLength(1);
  });

  it('filters out null person entries from results', async () => {
    mockSearchContacts.mockResolvedValue({
      data: { results: [{ person: makePerson() }, { person: null }, {}] },
    });

    const handler = registeredTools.get('google_contacts_search')!;
    const result = (await handler({ query: 'Test', limit: 10, response_format: 'json' })) as {
      structuredContent: { contacts: PersonEntry[] };
    };

    expect(result.structuredContent.contacts).toHaveLength(1);
  });

  it('returns no-results markdown when empty', async () => {
    mockSearchContacts.mockResolvedValue({
      data: { results: [] },
    });

    const handler = registeredTools.get('google_contacts_search')!;
    const result = (await handler({ query: 'Nobody', limit: 10, response_format: 'markdown' })) as {
      content: { type: string; text: string }[];
    };

    expect(result.content[0].text).toContain('No contacts found matching "Nobody"');
  });

  it('returns error on API failure', async () => {
    mockSearchContacts.mockRejectedValue(new Error('not found 404'));

    const handler = registeredTools.get('google_contacts_search')!;
    const result = (await handler({ query: 'Test', limit: 10, response_format: 'markdown' })) as {
      isError: boolean;
      content: { type: string; text: string }[];
    };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not found');
  });
});
