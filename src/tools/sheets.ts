import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { google } from 'googleapis';
import { z } from 'zod';
import { requireAuth } from '../auth/oauth.js';
import { ResponseFormat } from '../types.js';
import { handleGoogleError } from '../utils/errors.js';
import { truncateIfNeeded } from '../utils/format.js';

function getSheets() {
  return google.sheets({ version: 'v4', auth: requireAuth() });
}

export function registerSheetsTools(server: McpServer): void {
  // ─── google_sheets_create ─────────────────────────────────────────────────
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

  // ─── google_sheets_get_values ─────────────────────────────────────────────
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
            // Format as markdown table using first row as header
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

  // ─── google_sheets_update_values ─────────────────────────────────────────
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

  // ─── google_sheets_append_values ─────────────────────────────────────────
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

  // ─── google_sheets_add_sheet ──────────────────────────────────────────────
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

  // ─── google_sheets_delete_sheet ───────────────────────────────────────────
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

// ─── Exported Helpers (testable) ──────────────────────────────────────────────

/**
 * Parses a comma-separated headers string into a trimmed array.
 */
export function parseHeaders(headers: string): string[] {
  return headers.split(',').map((h) => h.trim());
}

/**
 * Wraps a sheet name in single quotes for safe A1 notation.
 * Escapes any embedded single quotes by doubling them.
 */
export function quoteSheetName(name: string): string {
  return `'${name.replace(/'/g, "''")}'`;
}

/**
 * Builds the web view link and structured response for a newly added sheet.
 */
export function formatAddSheetResponse(spreadsheetId: string, sheetName: string, sheetId: number) {
  const webViewLink = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheetId}`;
  return {
    text: `Tab created: **${sheetName}**\n- Sheet ID: \`${sheetId}\`\n- [Open Spreadsheet](${webViewLink})`,
    structuredContent: { sheet_id: sheetId, sheet_name: sheetName, spreadsheet_id: spreadsheetId, web_view_link: webViewLink },
  };
}

/**
 * Builds the response text for a deleted sheet.
 */
export function formatDeleteSheetResponse(spreadsheetId: string, sheetId: number) {
  const webViewLink = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
  return {
    text: `Tab with sheet ID \`${sheetId}\` deleted.\n- [Open Spreadsheet](${webViewLink})`,
  };
}
