import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getSheets } from './shared.js';
import { ResponseFormat } from '../../types.js';
import { handleGoogleError } from '../../utils/errors.js';
import { truncateIfNeeded } from '../../utils/format.js';

export function registerSheetsGetValues(server: McpServer): void {
  server.registerTool(
    'google_sheets_get_values',
    {
      title: 'Get Google Sheets Values',
      description: `Reads values from a range in a Google Sheets spreadsheet.

Args:
  - spreadsheet_id: Spreadsheet ID (from google_sheets_create or Google Drive)
  - range: A1 notation range (e.g., 'Sheet1!A1:D10', 'Sheet1!A:A', 'Sheet1')
  - response_format: 'markdown' (table view) or 'json' (raw values array)

Range examples:
  - 'Sheet1!A1:D10' — specific range in Sheet1
  - 'Sheet1!A:D'   — entire columns A through D
  - 'Sheet1'       — entire sheet (first 1000 rows returned)
  - 'A1:D10'       — uses the first sheet

Returns:
  - values: 2D array of cell values
  - range: The actual range that was returned`,
      inputSchema: z.object({
        spreadsheet_id: z.string().min(1).describe('Spreadsheet ID.'),
        range: z.string().min(1).describe("A1 notation range (e.g., 'Sheet1!A1:D10')."),
        response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ spreadsheet_id, range, response_format }) => {
      try {
        const sheets = getSheets();
        const res = await sheets.spreadsheets.values.get({
          spreadsheetId: spreadsheet_id,
          range,
          valueRenderOption: 'FORMATTED_VALUE',
        });

        const values = (res.data.values ?? []) as string[][];
        const returnedRange = res.data.range ?? range;

        let text: string;
        if (response_format === ResponseFormat.MARKDOWN) {
          if (values.length === 0) {
            text = `Range \`${returnedRange}\` is empty.`;
          } else {
            const [header, ...rows] = values;
            const headerRow = `| ${header.join(' | ')} |`;
            const separator = `| ${header.map(() => '---').join(' | ')} |`;
            const dataRows = rows.map((r) => {
              const padded = header.map((_, i) => r[i] ?? '');
              return `| ${padded.join(' | ')} |`;
            });
            text = [headerRow, separator, ...dataRows].join('\n');
          }
        } else {
          text = JSON.stringify({ range: returnedRange, values }, null, 2);
        }

        return {
          content: [{ type: 'text', text: truncateIfNeeded(text) }],
          structuredContent: { range: returnedRange, values, row_count: values.length },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
