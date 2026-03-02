import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  truncateIfNeeded,
  formatDate,
  decodeBase64Url,
  encodeBase64Url,
  buildRawEmail,
  extractEmailBody,
} from '../format.js';

vi.mock('../../constants.js', () => ({ CHARACTER_LIMIT: 100 }));

describe('truncateIfNeeded', () => {
  it('returns content unchanged when within limit', () => {
    const short = 'Hello world';
    expect(truncateIfNeeded(short)).toBe(short);
  });

  it('truncates and appends hint when over limit', () => {
    const long = 'x'.repeat(150);
    const result = truncateIfNeeded(long);
    expect(result.length).toBeLessThanOrEqual(200);
    expect(result.slice(0, 100)).toBe('x'.repeat(100));
    expect(result).toContain('Response truncated');
    expect(result).toContain('page_token');
  });

  it('exactly at limit returns unchanged', () => {
    const atLimit = 'a'.repeat(100);
    expect(truncateIfNeeded(atLimit)).toBe(atLimit);
  });
});

describe('formatDate', () => {
  it('formats ISO date string to locale string', () => {
    const result = formatDate('2026-03-01T14:30:00.000Z');
    expect(result).toMatch(/Mar.*1.*2026/);
    expect(result).not.toBe('Unknown');
  });

  it('returns Unknown for null', () => {
    expect(formatDate(null)).toBe('Unknown');
  });

  it('returns Unknown for undefined', () => {
    expect(formatDate(undefined)).toBe('Unknown');
  });

  it('returns Unknown for empty string', () => {
    expect(formatDate('')).toBe('Unknown');
  });

  it('returns Invalid Date for unparseable date string', () => {
    expect(formatDate('not-a-date')).toBe('Invalid Date');
  });

  it('returns dateStr when toLocaleString throws', () => {
    const badDate = '2026-03-01T00:00:00.000Z';
    const orig = Date.prototype.toLocaleString;
    Date.prototype.toLocaleString = () => {
      throw new Error('locale error');
    };
    try {
      expect(formatDate(badDate)).toBe(badDate);
    } finally {
      Date.prototype.toLocaleString = orig;
    }
  });
});

describe('decodeBase64Url', () => {
  it('decodes base64url to utf-8', () => {
    const encoded = Buffer.from('Hello world', 'utf-8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    expect(decodeBase64Url(encoded)).toBe('Hello world');
  });

  it('decodes empty string to empty string', () => {
    expect(decodeBase64Url('')).toBe('');
  });

  it('returns empty string when decode throws', () => {
    expect(decodeBase64Url(null as unknown as string)).toBe('');
    expect(decodeBase64Url(undefined as unknown as string)).toBe('');
  });
});

describe('encodeBase64Url', () => {
  it('encodes string to base64url (no +, /, =)', () => {
    const result = encodeBase64Url('test');
    expect(result).not.toContain('+');
    expect(result).not.toContain('/');
    expect(result).not.toContain('=');
  });

  it('round-trips with decodeBase64Url', () => {
    const original = 'Hello world';
    expect(decodeBase64Url(encodeBase64Url(original))).toBe(original);
  });
});

describe('buildRawEmail', () => {
  it('includes To, Subject, and body', () => {
    const raw = buildRawEmail({ to: 'a@b.com', subject: 'Hi', body: 'Hello' });
    const decoded = Buffer.from(
      raw.replace(/-/g, '+').replace(/_/g, '/'),
      'base64'
    ).toString('utf-8');
    expect(decoded).toContain('To: a@b.com');
    expect(decoded).toContain('Subject: Hi');
    expect(decoded).toContain('Hello');
  });

  it('includes From when provided', () => {
    const raw = buildRawEmail({
      to: 'b@b.com',
      from: 'a@a.com',
      subject: 'S',
      body: 'B',
    });
    const decoded = Buffer.from(
      raw.replace(/-/g, '+').replace(/_/g, '/'),
      'base64'
    ).toString('utf-8');
    expect(decoded).toContain('From: a@a.com');
  });

  it('includes In-Reply-To when inReplyTo provided', () => {
    const raw = buildRawEmail({
      to: 'b@b.com',
      subject: 'S',
      body: 'B',
      inReplyTo: '<msg-id@mail.gmail.com>',
    });
    const decoded = Buffer.from(
      raw.replace(/-/g, '+').replace(/_/g, '/'),
      'base64'
    ).toString('utf-8');
    expect(decoded).toContain('In-Reply-To: <msg-id@mail.gmail.com>');
  });

  it('includes Cc and Reply-To when provided', () => {
    const raw = buildRawEmail({
      to: 'b@b.com',
      subject: 'S',
      body: 'B',
      cc: 'cc@example.com',
      replyTo: 'reply@example.com',
    });
    const decoded = Buffer.from(
      raw.replace(/-/g, '+').replace(/_/g, '/'),
      'base64'
    ).toString('utf-8');
    expect(decoded).toContain('Cc: cc@example.com');
    expect(decoded).toContain('Reply-To: reply@example.com');
  });

  it('includes References when provided', () => {
    const raw = buildRawEmail({
      to: 'b@b.com',
      subject: 'S',
      body: 'B',
      references: '<ref1> <ref2>',
    });
    const decoded = Buffer.from(
      raw.replace(/-/g, '+').replace(/_/g, '/'),
      'base64'
    ).toString('utf-8');
    expect(decoded).toContain('References: <ref1> <ref2>');
  });
});

describe('extractEmailBody', () => {
  it('returns direct text/plain body', () => {
    const encoded = Buffer.from('Plain text body', 'utf-8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const payload = { mimeType: 'text/plain', body: { data: encoded } };
    expect(extractEmailBody(payload)).toBe('Plain text body');
  });

  it('returns empty for null payload', () => {
    expect(extractEmailBody(null)).toBe('');
  });

  it('returns empty for undefined payload', () => {
    expect(extractEmailBody(undefined)).toBe('');
  });

  it('strips html when mimeType is text/html', () => {
    const html = '<p>Hello <b>world</b></p>';
    const encoded = Buffer.from(html, 'utf-8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const payload = { mimeType: 'text/html', body: { data: encoded } };
    expect(extractEmailBody(payload)).toBe('Hello world');
  });

  it('recurses into parts for multipart', () => {
    const encoded = Buffer.from('Part body', 'utf-8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const payload = {
      mimeType: 'multipart/mixed',
      parts: [{ mimeType: 'text/plain', body: { data: encoded } }],
    };
    expect(extractEmailBody(payload)).toBe('Part body');
  });

  it('returns first non-empty part when multiple parts', () => {
    const encSecond = Buffer.from('Second part', 'utf-8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    const payload = {
      mimeType: 'multipart/mixed',
      parts: [
        { mimeType: 'text/plain', body: {} },
        { mimeType: 'text/plain', body: { data: encSecond } },
      ],
    };
    expect(extractEmailBody(payload)).toBe('Second part');
  });
});
