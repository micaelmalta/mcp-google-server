import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getSheets, parseHeaders, quoteSheetName, formatAddSheetResponse } from './shared.js';
import { handleGoogleError } from '../../utils/errors.js';

export function registerSheetsAddSheet(server: McpServer): void {
  server.registerTool(
    'google_sheets_add_sheet',
    {
      title: 'Add a Tab to a Google Sheet',
      description: `Creates a new tab (sheet) within an existing Google Sheets spreadsheet.

Args:
  - spreadsheet_id: Spreadsheet ID (from google_sheets_create or Google Drive)
  - title: Name for the new tab (required)
  - headers: Comma-separated column headers to add as the first row

Returns:
  - sheet_id: Numeric ID of the new sheet
  - title: Name of the new tab
  - web_view_link: URL to open the spreadsheet`,
      inputSchema: z.object({
        spreadsheet_id: z.string().min(1).describe('Spreadsheet ID.'),
        title: z.string().min(1).describe('Name for the new tab.'),
        headers: z.string().optional().describe("Comma-separated column headers (e.g., 'Name,Email,Date')."),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ spreadsheet_id, title, headers }) => {
      try {
        const sheets = getSheets();

        const res = await sheets.spreadsheets.batchUpdate({
          spreadsheetId: spreadsheet_id,
          requestBody: {
            requests: [{ addSheet: { properties: { title } } }],
          },
        });

        let sheetId = res.data.replies?.[0]?.addSheet?.properties?.sheetId;

        if (sheetId == null) {
          const metadata = await sheets.spreadsheets.get({
            spreadsheetId: spreadsheet_id,
            includeGridData: false,
          });
          sheetId = metadata.data.sheets?.find(
            (s) => s.properties?.title === title
          )?.properties?.sheetId;
        }

        if (sheetId == null) {
          throw new Error('Unable to determine sheetId for newly created sheet.');
        }

        if (headers) {
          const headerValues = parseHeaders(headers);
          await sheets.spreadsheets.values.update({
            spreadsheetId: spreadsheet_id,
            range: `${quoteSheetName(title)}!A1`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [headerValues] },
          });
        }

        const response = formatAddSheetResponse(spreadsheet_id, title, sheetId);

        return {
          content: [{ type: 'text', text: response.text }],
          structuredContent: response.structuredContent,
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
