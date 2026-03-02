import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerDocsCreate } from './create.js';
import { registerDocsGet } from './get.js';
import { registerDocsAppendText } from './append_text.js';

export function registerDocsTools(server: McpServer): void {
  registerDocsCreate(server);
  registerDocsGet(server);
  registerDocsAppendText(server);
}

export type { TabData } from './shared.js';
export { extractTabText, formatDocTabs } from './shared.js';
