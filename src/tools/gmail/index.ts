import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerListMessages } from './list_messages.js';
import { registerGetMessage } from './get_message.js';
import { registerSendEmail } from './send_email.js';
import { registerReplyEmail } from './reply_email.js';
import { registerListThreads } from './list_threads.js';
import { registerGetThread } from './get_thread.js';
import { registerModifyLabels } from './modify_labels.js';
import { registerListLabels } from './list_labels.js';
import { registerCreateDraft } from './create_draft.js';

export function registerGmailTools(server: McpServer): void {
  registerListMessages(server);
  registerGetMessage(server);
  registerSendEmail(server);
  registerReplyEmail(server);
  registerListThreads(server);
  registerGetThread(server);
  registerModifyLabels(server);
  registerListLabels(server);
  registerCreateDraft(server);
}
