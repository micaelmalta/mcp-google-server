import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { google } from 'googleapis';
import { z } from 'zod';
import { requireAuth } from '../auth/oauth.js';
import { ResponseFormat } from '../types.js';
import { handleGoogleError } from '../utils/errors.js';
import { formatDate, truncateIfNeeded, buildRawEmail, extractEmailBody } from '../utils/format.js';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../constants.js';

function getGmail() {
  const auth = requireAuth();
  return google.gmail({ version: 'v1', auth });
}

export function registerGmailTools(server: McpServer): void {
  // ─── google_gmail_list_messages ───────────────────────────────────────────
  server.registerTool(
    'google_gmail_list_messages',
    {
      title: 'List Gmail Messages',
      description: `Lists Gmail messages matching an optional search query.

Supports Gmail's full search syntax (same as the Gmail search bar):
  - "from:alice@example.com" - from a specific sender
  - "subject:invoice" - subject contains word
  - "is:unread" - unread messages
  - "label:work" - messages with a label
  - "after:2024/01/01 before:2024/02/01" - date range
  - "has:attachment" - messages with attachments

Args:
  - query: Gmail search query (optional, returns all if omitted)
  - limit: Max messages to return (1-${MAX_PAGE_SIZE}, default: ${DEFAULT_PAGE_SIZE})
  - page_token: Token from previous call for pagination
  - include_body: Whether to include message body preview (default: false, uses more quota)
  - label_ids: Comma-separated label IDs to filter by (e.g., "INBOX,UNREAD")
  - response_format: 'markdown' or 'json'

Returns:
  - messages[].id: Message ID (use with google_gmail_get_message)
  - messages[].thread_id: Thread ID
  - messages[].from / to / subject / date: Common headers
  - messages[].snippet: Short preview of the message
  - next_page_token: Token for next page`,
      inputSchema: z.object({
        query: z.string().optional().describe('Gmail search query.'),
        limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
        page_token: z.string().optional(),
        include_body: z.boolean().default(false).describe('Include body preview (uses more API quota).'),
        label_ids: z.string().optional().describe("Comma-separated label IDs (e.g., 'INBOX,UNREAD')."),
        response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ query, limit, page_token, include_body, label_ids, response_format }) => {
      try {
        const gmail = getGmail();
        const listRes = await gmail.users.messages.list({
          userId: 'me',
          q: query,
          maxResults: limit,
          pageToken: page_token,
          labelIds: label_ids ? label_ids.split(',').map((l) => l.trim()) : undefined,
        });

        const messageRefs = listRes.data.messages ?? [];
        const nextPageToken = listRes.data.nextPageToken ?? undefined;

        if (messageRefs.length === 0) {
          return {
            content: [{ type: 'text', text: `No messages found${query ? ` matching "${query}"` : ''}.` }],
            structuredContent: { messages: [], has_more: false },
          };
        }

        // Fetch message details in parallel (batch)
        const format = include_body ? 'full' : 'metadata';
        const metadataHeaders = ['From', 'To', 'Subject', 'Date'];

        const messages = await Promise.all(
          messageRefs.map(async (ref) => {
            const msg = await gmail.users.messages.get({
              userId: 'me',
              id: ref.id!,
              format,
              metadataHeaders: include_body ? undefined : metadataHeaders,
            });
            const data = msg.data;
            const headers = (data.payload?.headers ?? []).reduce<Record<string, string>>((acc, h) => {
              if (h.name) acc[h.name.toLowerCase()] = h.value ?? '';
              return acc;
            }, {});

            return {
              id: data.id ?? '',
              thread_id: data.threadId ?? '',
              from: headers['from'] ?? '',
              to: headers['to'] ?? '',
              subject: headers['subject'] ?? '(No subject)',
              date: headers['date'] ?? '',
              snippet: data.snippet ?? '',
              label_ids: data.labelIds ?? [],
              body: include_body ? extractEmailBody(data.payload) : undefined,
            };
          })
        );

        let text: string;
        if (response_format === ResponseFormat.MARKDOWN) {
          const lines = [`# Gmail Messages (${messages.length}${nextPageToken ? '+' : ''})`, ''];
          for (const m of messages) {
            lines.push(`## ${m.subject}`);
            lines.push(`- **From**: ${m.from}`);
            lines.push(`- **Date**: ${formatDate(m.date)}`);
            lines.push(`- **ID**: \`${m.id}\``);
            if (m.snippet) lines.push(`- **Preview**: ${m.snippet}`);
            lines.push('');
          }
          if (nextPageToken) lines.push(`*Use page_token="${nextPageToken}" for next page.*`);
          text = lines.join('\n');
        } else {
          text = JSON.stringify({ messages, next_page_token: nextPageToken, has_more: !!nextPageToken }, null, 2);
        }

        return {
          content: [{ type: 'text', text: truncateIfNeeded(text) }],
          structuredContent: { messages, next_page_token: nextPageToken, has_more: !!nextPageToken },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );

  // ─── google_gmail_get_message ─────────────────────────────────────────────
  server.registerTool(
    'google_gmail_get_message',
    {
      title: 'Get a Gmail Message',
      description: `Retrieves the full content of a Gmail message by its ID.

Args:
  - message_id: Message ID from google_gmail_list_messages or google_gmail_list_threads
  - response_format: 'markdown' or 'json'

Returns:
  - id, thread_id: Identifiers
  - from, to, cc, subject, date: Email headers
  - body: Full decoded message body (plain text)
  - label_ids: Gmail labels applied to message
  - attachments: List of attachment names (content not downloaded)`,
      inputSchema: z.object({
        message_id: z.string().min(1).describe('Message ID.'),
        response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ message_id, response_format }) => {
      try {
        const gmail = getGmail();
        const res = await gmail.users.messages.get({ userId: 'me', id: message_id, format: 'full' });
        const data = res.data;

        const headers = (data.payload?.headers ?? []).reduce<Record<string, string>>((acc, h) => {
          if (h.name) acc[h.name.toLowerCase()] = h.value ?? '';
          return acc;
        }, {});

        const attachments = (data.payload?.parts ?? [])
          .filter((p) => p.filename)
          .map((p) => ({ filename: p.filename ?? '', mime_type: p.mimeType ?? '' }));

        const message = {
          id: data.id ?? '',
          thread_id: data.threadId ?? '',
          from: headers['from'] ?? '',
          to: headers['to'] ?? '',
          cc: headers['cc'] ?? '',
          subject: headers['subject'] ?? '(No subject)',
          date: headers['date'] ?? '',
          body: extractEmailBody(data.payload),
          label_ids: data.labelIds ?? [],
          attachments,
        };

        let text: string;
        if (response_format === ResponseFormat.MARKDOWN) {
          const lines = [
            `# ${message.subject}`,
            '',
            `**From:** ${message.from}`,
            `**To:** ${message.to}`,
            message.cc ? `**Cc:** ${message.cc}` : '',
            `**Date:** ${formatDate(message.date)}`,
            `**Labels:** ${message.label_ids.join(', ')}`,
            '',
            '---',
            '',
            message.body || '(No text content)',
          ].filter((l) => l !== '');
          text = lines.join('\n');
        } else {
          text = JSON.stringify(message, null, 2);
        }

        return {
          content: [{ type: 'text', text: truncateIfNeeded(text) }],
          structuredContent: message,
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );

  // ─── google_gmail_send_email ──────────────────────────────────────────────
  server.registerTool(
    'google_gmail_send_email',
    {
      title: 'Send a Gmail Email',
      description: `Sends an email via Gmail.

Args:
  - to: Recipient email address (required)
  - subject: Email subject (required)
  - body: Plain text email body (required)
  - cc: Comma-separated CC email addresses
  - reply_to: Reply-To email address

Returns:
  - message_id: ID of the sent message
  - thread_id: Thread ID`,
      inputSchema: z.object({
        to: z.string().email().describe('Recipient email address.'),
        subject: z.string().min(1).describe('Email subject.'),
        body: z.string().min(1).describe('Plain text email body.'),
        cc: z.string().optional().describe('Comma-separated CC addresses.'),
        reply_to: z.string().email().optional().describe('Reply-To address.'),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ to, subject, body, cc, reply_to }) => {
      try {
        const gmail = getGmail();
        const raw = buildRawEmail({ to, subject, body, cc, replyTo: reply_to });

        const res = await gmail.users.messages.send({
          userId: 'me',
          requestBody: { raw },
        });

        return {
          content: [
            {
              type: 'text',
              text: `Email sent successfully.\n- **To**: ${to}\n- **Subject**: ${subject}\n- **Message ID**: \`${res.data.id}\``,
            },
          ],
          structuredContent: { message_id: res.data.id, thread_id: res.data.threadId },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );

  // ─── google_gmail_reply_email ─────────────────────────────────────────────
  server.registerTool(
    'google_gmail_reply_email',
    {
      title: 'Reply to a Gmail Thread',
      description: `Sends a reply to an existing Gmail thread.

Args:
  - message_id: ID of the message to reply to (use google_gmail_get_message to get thread details)
  - body: Plain text reply body

The reply will automatically be threaded to the correct conversation.

Returns:
  - message_id: ID of the sent reply
  - thread_id: Thread ID`,
      inputSchema: z.object({
        message_id: z.string().min(1).describe('ID of the message to reply to.'),
        body: z.string().min(1).describe('Reply body text.'),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ message_id, body }) => {
      try {
        const gmail = getGmail();

        // Get the original message to extract headers for threading
        const original = await gmail.users.messages.get({
          userId: 'me',
          id: message_id,
          format: 'metadata',
          metadataHeaders: ['From', 'Subject', 'Message-ID', 'References'],
        });

        const headers = (original.data.payload?.headers ?? []).reduce<Record<string, string>>((acc, h) => {
          if (h.name) acc[h.name.toLowerCase()] = h.value ?? '';
          return acc;
        }, {});

        const subject = headers['subject']?.startsWith('Re:')
          ? headers['subject']
          : `Re: ${headers['subject'] ?? ''}`;

        const raw = buildRawEmail({
          to: headers['from'] ?? '',
          subject,
          body,
          inReplyTo: headers['message-id'],
          references: [headers['references'], headers['message-id']].filter(Boolean).join(' '),
          threadId: original.data.threadId ?? undefined,
        });

        const res = await gmail.users.messages.send({
          userId: 'me',
          requestBody: { raw, threadId: original.data.threadId ?? undefined },
        });

        return {
          content: [
            {
              type: 'text',
              text: `Reply sent.\n- **To**: ${headers['from']}\n- **Subject**: ${subject}\n- **Message ID**: \`${res.data.id}\``,
            },
          ],
          structuredContent: { message_id: res.data.id, thread_id: res.data.threadId },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );

  // ─── google_gmail_list_threads ────────────────────────────────────────────
  server.registerTool(
    'google_gmail_list_threads',
    {
      title: 'List Gmail Threads',
      description: `Lists Gmail conversation threads matching an optional search query.

A thread groups all messages in the same conversation. Useful for reading full conversations.

Args:
  - query: Gmail search query (same syntax as google_gmail_list_messages)
  - limit: Max threads (1-${MAX_PAGE_SIZE}, default: ${DEFAULT_PAGE_SIZE})
  - page_token: Pagination token

Returns:
  - threads[].id: Thread ID (use with google_gmail_get_thread)
  - threads[].snippet: Preview snippet
  - threads[].history_id: History ID for change detection`,
      inputSchema: z.object({
        query: z.string().optional(),
        limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
        page_token: z.string().optional(),
        response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ query, limit, page_token, response_format }) => {
      try {
        const gmail = getGmail();
        const res = await gmail.users.threads.list({
          userId: 'me',
          q: query,
          maxResults: limit,
          pageToken: page_token,
        });

        const threads = (res.data.threads ?? []).map((t) => ({
          id: t.id ?? '',
          snippet: t.snippet ?? '',
          history_id: t.historyId ?? '',
        }));

        const nextPageToken = res.data.nextPageToken ?? undefined;

        let text: string;
        if (response_format === ResponseFormat.MARKDOWN) {
          const lines = [`# Gmail Threads (${threads.length})`, ''];
          for (const t of threads) {
            lines.push(`- **ID**: \`${t.id}\` — ${t.snippet.slice(0, 100)}`);
          }
          if (nextPageToken) lines.push(`\n*Use page_token="${nextPageToken}" for next page.*`);
          text = lines.join('\n');
        } else {
          text = JSON.stringify({ threads, next_page_token: nextPageToken, has_more: !!nextPageToken }, null, 2);
        }

        return {
          content: [{ type: 'text', text: truncateIfNeeded(text) }],
          structuredContent: { threads, next_page_token: nextPageToken, has_more: !!nextPageToken },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );

  // ─── google_gmail_get_thread ──────────────────────────────────────────────
  server.registerTool(
    'google_gmail_get_thread',
    {
      title: 'Get a Full Gmail Thread',
      description: `Retrieves all messages in a Gmail thread (conversation).

Args:
  - thread_id: Thread ID from google_gmail_list_threads

Returns all messages in the thread with their headers and body text, ordered chronologically.`,
      inputSchema: z.object({
        thread_id: z.string().min(1).describe('Thread ID.'),
        response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ thread_id, response_format }) => {
      try {
        const gmail = getGmail();
        const res = await gmail.users.threads.get({ userId: 'me', id: thread_id, format: 'full' });

        const messages = (res.data.messages ?? []).map((data) => {
          const headers = (data.payload?.headers ?? []).reduce<Record<string, string>>((acc, h) => {
            if (h.name) acc[h.name.toLowerCase()] = h.value ?? '';
            return acc;
          }, {});
          return {
            id: data.id ?? '',
            from: headers['from'] ?? '',
            to: headers['to'] ?? '',
            subject: headers['subject'] ?? '(No subject)',
            date: headers['date'] ?? '',
            body: extractEmailBody(data.payload),
            label_ids: data.labelIds ?? [],
          };
        });

        let text: string;
        if (response_format === ResponseFormat.MARKDOWN) {
          const lines = [`# Thread (${messages.length} messages)`, ''];
          for (const [i, m] of messages.entries()) {
            lines.push(`## Message ${i + 1}: ${m.subject}`);
            lines.push(`**From:** ${m.from} | **Date:** ${formatDate(m.date)}`);
            lines.push('');
            lines.push(m.body || '(No text content)');
            lines.push('');
            lines.push('---');
            lines.push('');
          }
          text = lines.join('\n');
        } else {
          text = JSON.stringify({ thread_id, messages }, null, 2);
        }

        return {
          content: [{ type: 'text', text: truncateIfNeeded(text) }],
          structuredContent: { thread_id, messages },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );

  // ─── google_gmail_modify_labels ───────────────────────────────────────────
  server.registerTool(
    'google_gmail_modify_labels',
    {
      title: 'Modify Gmail Message Labels',
      description: `Adds or removes labels from one or more Gmail messages.

Common label IDs:
  - INBOX, SENT, TRASH, SPAM, STARRED, UNREAD
  - Custom labels have IDs like "Label_12345" (get IDs from google_gmail_list_labels)

Args:
  - message_ids: Comma-separated message IDs to modify
  - add_labels: Comma-separated label IDs to add
  - remove_labels: Comma-separated label IDs to remove

Examples:
  - Mark as read: remove_labels="UNREAD"
  - Archive: remove_labels="INBOX"
  - Star: add_labels="STARRED"
  - Move to trash: add_labels="TRASH", remove_labels="INBOX"`,
      inputSchema: z.object({
        message_ids: z.string().min(1).describe('Comma-separated message IDs.'),
        add_labels: z.string().optional().describe('Comma-separated label IDs to add.'),
        remove_labels: z.string().optional().describe('Comma-separated label IDs to remove.'),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ message_ids, add_labels, remove_labels }) => {
      try {
        if (!add_labels && !remove_labels) {
          return {
            isError: true,
            content: [{ type: 'text', text: 'Error: At least one of add_labels or remove_labels must be provided.' }],
          };
        }

        const gmail = getGmail();
        const ids = message_ids.split(',').map((id) => id.trim());

        await gmail.users.messages.batchModify({
          userId: 'me',
          requestBody: {
            ids,
            addLabelIds: add_labels ? add_labels.split(',').map((l) => l.trim()) : undefined,
            removeLabelIds: remove_labels ? remove_labels.split(',').map((l) => l.trim()) : undefined,
          },
        });

        return {
          content: [
            {
              type: 'text',
              text: `Labels updated for ${ids.length} message(s).\n- Added: ${add_labels ?? 'none'}\n- Removed: ${remove_labels ?? 'none'}`,
            },
          ],
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );

  // ─── google_gmail_list_labels ─────────────────────────────────────────────
  server.registerTool(
    'google_gmail_list_labels',
    {
      title: 'List Gmail Labels',
      description: `Lists all Gmail labels including system labels (INBOX, SENT, etc.) and user-created labels.

Use the label IDs returned here with google_gmail_modify_labels and google_gmail_list_messages.

Returns:
  - labels[].id: Label ID to use in other tools
  - labels[].name: Display name
  - labels[].type: 'system' or 'user'
  - labels[].messages_total / messages_unread: Message counts`,
      inputSchema: z.object({
        response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ response_format }) => {
      try {
        const gmail = getGmail();
        const res = await gmail.users.labels.list({ userId: 'me' });

        const labels = (res.data.labels ?? []).map((l) => ({
          id: l.id ?? '',
          name: l.name ?? '',
          type: l.type ?? '',
          messages_total: l.messagesTotal ?? 0,
          messages_unread: l.messagesUnread ?? 0,
        }));

        let text: string;
        if (response_format === ResponseFormat.MARKDOWN) {
          const system = labels.filter((l) => l.type === 'system');
          const user = labels.filter((l) => l.type === 'user');

          const lines = ['# Gmail Labels', '', '## System Labels'];
          for (const l of system) {
            lines.push(`- **${l.name}** (\`${l.id}\`) — ${l.messages_unread} unread`);
          }
          if (user.length) {
            lines.push('', '## Custom Labels');
            for (const l of user) {
              lines.push(`- **${l.name}** (\`${l.id}\`) — ${l.messages_unread} unread`);
            }
          }
          text = lines.join('\n');
        } else {
          text = JSON.stringify({ labels }, null, 2);
        }

        return {
          content: [{ type: 'text', text }],
          structuredContent: { labels },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
