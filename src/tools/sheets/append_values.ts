import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getSheets } from './shared.js';
import { handleGoogleError } from '../../utils/errors.js';

export function registerSheetsAppendValues(server: McpServer): void {
  server.registerTool(
    'google_sheets_append_values',
    {
      title: 'Append Rows to Google Sheets',
      description: `Appends new rows to the end of data in a Google Sheets spreadsheet.

Automatically finds the last row with data and appends after it.

Args:
  - spreadsheet_id: Spreadsheet ID
  - range: Sheet name or range to append to (e.g., 'Sheet1' or 'Sheet1!A:D')
  - values: JSON array of rows to append. Example: [["Alice", "alice@example.com"], ["Bob", "bob@example.com"]]`,
      inputSchema: z.object({
        spreadsheet_id: z.string().min(1).describe('Spreadsheet ID.'),
        range: z.string().min(1).describe("Sheet name or range (e.g., 'Sheet1')."),
        values: z.string().min(1).describe('JSON array of rows to append.'),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ spreadsheet_id, range, values: valuesJson }) => {
      try {
        const sheets = getSheets();
        let parsedValues: unknown[][];

        try {
          parsedValues = JSON.parse(valuesJson) as unknown[][];
        } catch (e) {
          return {
            isError: true,
            content: [{ type: 'text', text: `Error: Invalid values JSON. ${String(e)}` }],
          };
        }

        const res = await sheets.spreadsheets.values.append({
          spreadsheetId: spreadsheet_id,
          range,
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          requestBody: { values: parsedValues },
        });

        return {
          content: [
            {
              type: 'text',
              text: `Appended ${res.data.updates?.updatedRows ?? parsedValues.length} row(s) to \`${range}\`.\n- [Open Spreadsheet](https://docs.google.com/spreadsheets/d/${spreadsheet_id}/edit)`,
            },
          ],
          structuredContent: {
            updated_range: res.data.updates?.updatedRange,
            updated_rows: res.data.updates?.updatedRows,
          },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
