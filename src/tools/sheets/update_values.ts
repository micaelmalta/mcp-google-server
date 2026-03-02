import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getSheets } from './shared.js';
import { handleGoogleError } from '../../utils/errors.js';

export function registerSheetsUpdateValues(server: McpServer): void {
  server.registerTool(
    'google_sheets_update_values',
    {
      title: 'Update Google Sheets Values',
      description: `Writes values to a range in a Google Sheets spreadsheet, replacing existing content.

Args:
  - spreadsheet_id: Spreadsheet ID
  - range: A1 notation starting cell or range (e.g., 'Sheet1!A1', 'Sheet1!B2:D4')
  - values: JSON array of rows, where each row is an array of cell values.
            Example: [["Alice", 30, "alice@example.com"], ["Bob", 25, "bob@example.com"]]

The values are written starting from the top-left cell of the range.`,
      inputSchema: z.object({
        spreadsheet_id: z.string().min(1).describe('Spreadsheet ID.'),
        range: z.string().min(1).describe("Starting cell in A1 notation (e.g., 'Sheet1!A1')."),
        values: z.string().min(1).describe('JSON array of rows. Each row is an array of values. E.g., [["A1","B1"],["A2","B2"]]'),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ spreadsheet_id, range, values: valuesJson }) => {
      try {
        const sheets = getSheets();
        let parsedValues: unknown[][];

        try {
          parsedValues = JSON.parse(valuesJson) as unknown[][];
          if (!Array.isArray(parsedValues)) throw new Error('values must be a JSON array');
        } catch (e) {
          return {
            isError: true,
            content: [{ type: 'text', text: `Error: Invalid values JSON. Provide a 2D array like [["A1","B1"],["A2","B2"]]. Parse error: ${String(e)}` }],
          };
        }

        const res = await sheets.spreadsheets.values.update({
          spreadsheetId: spreadsheet_id,
          range,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: parsedValues },
        });

        return {
          content: [
            {
              type: 'text',
              text: `Updated ${res.data.updatedCells ?? 0} cell(s) in range \`${res.data.updatedRange}\`.\n- [Open Spreadsheet](https://docs.google.com/spreadsheets/d/${spreadsheet_id}/edit)`,
            },
          ],
          structuredContent: {
            updated_cells: res.data.updatedCells,
            updated_range: res.data.updatedRange,
            updated_rows: res.data.updatedRows,
          },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
