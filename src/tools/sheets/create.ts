import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getSheets, parseHeaders, quoteSheetName } from './shared.js';
import { handleGoogleError } from '../../utils/errors.js';

export function registerSheetsCreate(server: McpServer): void {
  server.registerTool(
    'google_sheets_create',
    {
      title: 'Create a Google Sheet',
      description: `Creates a new Google Sheets spreadsheet with optional initial data.

Args:
  - title: Spreadsheet title (required)
  - sheet_name: Name of the first sheet (default: 'Sheet1')
  - headers: Comma-separated column headers to add as the first row

Returns:
  - spreadsheet_id: ID to use in google_sheets_get_values and google_sheets_update_values
  - web_view_link: URL to open the spreadsheet`,
      inputSchema: z.object({
        title: z.string().min(1).describe('Spreadsheet title.'),
        sheet_name: z.string().default('Sheet1').describe('First sheet name.'),
        headers: z.string().optional().describe("Comma-separated column headers (e.g., 'Name,Email,Date')."),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ title, sheet_name, headers }) => {
      try {
        const sheets = getSheets();
        const createRes = await sheets.spreadsheets.create({
          requestBody: {
            properties: { title },
            sheets: [{ properties: { title: sheet_name } }],
          },
        });

        const spreadsheetId = createRes.data.spreadsheetId!;

        if (headers) {
          const headerValues = parseHeaders(headers);
          await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `${quoteSheetName(sheet_name)}!A1`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [headerValues] },
          });
        }

        const webViewLink = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

        return {
          content: [
            {
              type: 'text',
              text: `Spreadsheet created: **${title}**\n- ID: \`${spreadsheetId}\`\n- [Open Spreadsheet](${webViewLink})`,
            },
          ],
          structuredContent: { spreadsheet_id: spreadsheetId, title, web_view_link: webViewLink },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );
}
