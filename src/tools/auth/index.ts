import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAuthStart } from './auth_start.js';
import { registerAuthStatus } from './auth_status.js';
import { registerAuthRevoke } from './auth_revoke.js';

export function registerAuthTools(server: McpServer): void {
  registerAuthStart(server);
  registerAuthStatus(server);
  registerAuthRevoke(server);
}
