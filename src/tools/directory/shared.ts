import { google } from 'googleapis';
import { requireAuth } from '../../auth/oauth.js';

export function getPeople() {
  const auth = requireAuth();
  return google.people({ version: 'v1', auth });
}

export const PERSON_FIELDS = 'names,emailAddresses,phoneNumbers,organizations,photos,biographies';
export const DIRECTORY_SOURCES = ['DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE'] as const;

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
