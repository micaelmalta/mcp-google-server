import { describe, it, expect } from 'vitest';
import { extractPerson, formatPersonMarkdown, type PersonEntry } from '../index.js';

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
