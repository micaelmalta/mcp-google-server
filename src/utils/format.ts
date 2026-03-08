import nodemailer from 'nodemailer';
import type { Readable } from 'stream';
import { CHARACTER_LIMIT } from '../constants.js';

const _transport = nodemailer.createTransport({ streamTransport: true, newline: 'unix' });

/**
 * Truncates a response string if it exceeds CHARACTER_LIMIT,
 * appending a helpful hint for agents to use pagination.
 */
export function truncateIfNeeded(content: string): string {
  if (content.length <= CHARACTER_LIMIT) return content;
  const truncated = content.slice(0, CHARACTER_LIMIT);
  return `${truncated}\n\n[Response truncated at ${CHARACTER_LIMIT} characters. Use page_token or narrower filters to see more results.]`;
}

/**
 * Formats an ISO date string to human-readable form.
 */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Unknown';
  try {
    return new Date(dateStr).toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return dateStr;
  }
}

/**
 * Converts raw email bytes (base64url encoded) to readable text.
 * Returns empty string if conversion fails.
 */
export function decodeBase64Url(encoded: string): string {
  try {
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64, 'base64').toString('utf-8');
  } catch {
    return '';
  }
}

/**
 * Encodes a string to base64url format (used for Gmail raw messages).
 */
export function encodeBase64Url(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Composes a raw RFC 2822 email message suitable for Gmail API using nodemailer.
 * Nodemailer handles header encoding and injection protection automatically.
 */
export async function composeRawEmail(params: {
  to: string;
  from?: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
  replyTo?: string;
  inReplyTo?: string;
  references?: string;
}): Promise<string> {
  const info = await _transport.sendMail({
    to: params.to,
    from: params.from,
    subject: params.subject,
    text: params.body,
    cc: params.cc,
    bcc: params.bcc,
    replyTo: params.replyTo,
    inReplyTo: params.inReplyTo,
    references: params.references,
  });

  const chunks: Buffer[] = [];
  for await (const chunk of info.message as Readable) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }

  return Buffer.concat(chunks)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Extracts plain text body from a Gmail message payload.
 */
export function extractEmailBody(
  payload: { mimeType?: string | null; body?: { data?: string | null } | null; parts?: unknown[] | null } | null | undefined
): string {
  if (!payload) return '';

  // Direct text/plain
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  // text/html fallback
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    const html = decodeBase64Url(payload.body.data);
    // Very basic HTML stripping
    return html.replace(/<[^>]+>/g, '').trim();
  }

  // Recurse into parts
  if (Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      const text = extractEmailBody(
        part as { mimeType?: string; body?: { data?: string }; parts?: unknown[] }
      );
      if (text) return text;
    }
  }

  return '';
}
