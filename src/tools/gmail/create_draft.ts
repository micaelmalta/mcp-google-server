import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getGmail } from './shared.js';
import { handleGoogleError } from '../../utils/errors.js';
import { buildRawEmail } from '../../utils/format.js';

export function registerCreateDraft(server: McpServer): void {
  server.registerTool(
    'google_gmail_create_draft',
    {
      inputSchema: z.object({
        to: z.string().optional().describe('Recipient(s), comma-separated. Auto-populated for reply-all when reply_to_message_id is provided.'),
        subject: z.string().optional().describe('Email subject. Auto-prefixed with "Re: " when reply_to_message_id is provided.'),
        body: z.string().describe('Email body text'),
        cc: z.string().optional().describe('CC recipients, comma-separated'),
        bcc: z.string().optional().describe('BCC recipients, comma-separated'),
        reply_to_message_id: z.string().optional().describe('Message ID to reply to. Enables threading and defaults to reply-all (excludes your own address from recipients).'),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (args) => {
      try {
        const gmail = getGmail();

        let effectiveTo: string;
        let effectiveCc: string | undefined;
        let effectiveSubj: string;
        let inReplyTo: string | undefined;
        let references: string | undefined;
        let threadId: string | undefined;

        if (args.reply_to_message_id) {
          const [msgRes, profileRes] = await Promise.all([
            gmail.users.messages.get({
              userId: 'me',
              id: args.reply_to_message_id,
              format: 'metadata',
              metadataHeaders: ['From', 'To', 'Cc', 'Subject', 'Message-ID', 'References'],
            }),
            gmail.users.getProfile({ userId: 'me' }),
          ]);

          const myEmail = (profileRes.data.emailAddress ?? '').toLowerCase();
          const headerMap: Record<string, string> = {};
          for (const h of msgRes.data.payload?.headers ?? []) {
            if (h.name && h.value) headerMap[h.name.toLowerCase()] = h.value;
          }

          const splitAddrs = (str: string | undefined): string[] =>
            (str ?? '').split(',').map(s => s.trim()).filter(s => s.length > 0 && !s.toLowerCase().includes(myEmail));

          const replyToList = [...splitAddrs(headerMap['from']), ...splitAddrs(headerMap['to'])];
          const ccList = splitAddrs(headerMap['cc']);

          effectiveTo = args.to ?? replyToList.join(', ');
          effectiveCc = args.cc ?? (ccList.length > 0 ? ccList.join(', ') : undefined);

          const origSubject = headerMap['subject'] ?? '';
          effectiveSubj = args.subject ?? (origSubject.startsWith('Re:') ? origSubject : `Re: ${origSubject}`);

          inReplyTo = headerMap['message-id'];
          const refs = [headerMap['references'], headerMap['message-id']].filter(Boolean).join(' ');
          references = refs.length > 0 ? refs : undefined;
          threadId = msgRes.data.threadId ?? undefined;
        } else {
          if (!args.to) {
            return { isError: true, content: [{ type: 'text' as const, text: "Either 'to' or 'reply_to_message_id' is required." }] };
          }
          if (!args.subject) {
            return { isError: true, content: [{ type: 'text' as const, text: "Either 'subject' or 'reply_to_message_id' is required." }] };
          }
          effectiveTo = args.to;
          effectiveCc = args.cc;
          effectiveSubj = args.subject;
        }

        const raw = buildRawEmail({
          to: effectiveTo,
          subject: effectiveSubj,
          body: args.body,
          cc: effectiveCc,
          bcc: args.bcc,
          inReplyTo,
          references,
        });

        const res = await gmail.users.drafts.create({
          userId: 'me',
          requestBody: { message: { raw, threadId } },
        });
        const draftId = res.data.id ?? '';
        const messageId = res.data.message?.id ?? '';
        return {
          content: [{ type: 'text', text: `Draft created successfully.\n\nDraft ID: ${draftId}\nTo: ${effectiveTo}\nSubject: ${effectiveSubj}` }],
          structuredContent: { draft_id: draftId, message_id: messageId },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
