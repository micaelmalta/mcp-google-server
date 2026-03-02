import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerDirectorySearch } from './search.js';
import { registerDirectoryList } from './list.js';
import { registerContactsList } from './contacts_list.js';
import { registerContactsSearch } from './contacts_search.js';

export function registerDirectoryTools(server: McpServer): void {
  registerDirectorySearch(server);
  registerDirectoryList(server);
  registerContactsList(server);
  registerContactsSearch(server);
}

export type { PersonEntry } from './shared.js';
export { extractPerson, formatPersonMarkdown } from './shared.js';
