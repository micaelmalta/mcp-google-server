import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerDocsCreate } from './create.js';
import { registerDocsGet } from './get.js';
import { registerDocsAppendText } from './append_text.js';
import { registerDocsReplaceContent } from './replace_content.js';

export function registerDocsTools(server: McpServer): void {
  registerDocsCreate(server);
  registerDocsGet(server);
  registerDocsAppendText(server);
  registerDocsReplaceContent(server);
}

export type { TabData } from './shared.js';
export { extractTabText } from './shared.js';
