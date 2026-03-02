import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getSheets, formatDeleteSheetResponse } from './shared.js';
import { handleGoogleError } from '../../utils/errors.js';

export function registerSheetsDeleteSheet(server: McpServer): void {
  server.registerTool(
    'google_sheets_delete_sheet',
    {
      title: 'Delete a Tab from a Google Sheet',
      description: `Deletes a tab (sheet) from an existing Google Sheets spreadsheet.

Args:
  - spreadsheet_id: Spreadsheet ID (from google_sheets_create or Google Drive)
  - sheet_id: Numeric sheet ID of the tab to delete (from google_sheets_add_sheet or the spreadsheet URL's gid parameter)

Note: You cannot delete the last remaining tab in a spreadsheet.`,
      inputSchema: z.object({
        spreadsheet_id: z.string().min(1).describe('Spreadsheet ID.'),
        sheet_id: z.number().int().describe('Numeric sheet ID of the tab to delete.'),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    async ({ spreadsheet_id, sheet_id }) => {
      try {
        const sheets = getSheets();

        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: spreadsheet_id,
          requestBody: {
            requests: [{ deleteSheet: { sheetId: sheet_id } }],
          },
        });

        const response = formatDeleteSheetResponse(spreadsheet_id, sheet_id);

        return {
          content: [{ type: 'text', text: response.text }],
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
