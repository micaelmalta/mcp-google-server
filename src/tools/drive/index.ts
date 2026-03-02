import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerListFiles } from './list_files.js';
import { registerSearchFiles } from './search_files.js';
import { registerGetFile } from './get_file.js';
import { registerCreateFolder } from './create_folder.js';
import { registerMoveFile } from './move_file.js';
import { registerDeleteFile } from './delete_file.js';
import { registerShareFile } from './share_file.js';
import { registerListPermissions } from './list_permissions.js';

export function registerDriveTools(server: McpServer): void {
  registerListFiles(server);
  registerSearchFiles(server);
  registerGetFile(server);
  registerCreateFolder(server);
  registerMoveFile(server);
  registerDeleteFile(server);
  registerShareFile(server);
  registerListPermissions(server);
}
