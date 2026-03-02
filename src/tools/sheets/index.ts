import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSheetsCreate } from './create.js';
import { registerSheetsGetValues } from './get_values.js';
import { registerSheetsUpdateValues } from './update_values.js';
import { registerSheetsAppendValues } from './append_values.js';
import { registerSheetsAddSheet } from './add_sheet.js';
import { registerSheetsDeleteSheet } from './delete_sheet.js';

export function registerSheetsTools(server: McpServer): void {
  registerSheetsCreate(server);
  registerSheetsGetValues(server);
  registerSheetsUpdateValues(server);
  registerSheetsAppendValues(server);
  registerSheetsAddSheet(server);
  registerSheetsDeleteSheet(server);
}

export { parseHeaders, quoteSheetName } from './shared.js';
