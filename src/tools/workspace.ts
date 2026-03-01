import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { google } from 'googleapis';
import { z } from 'zod';
import { requireAuth } from '../auth/oauth.js';
import { ResponseFormat } from '../types.js';
import { handleGoogleError } from '../utils/errors.js';
import { truncateIfNeeded } from '../utils/format.js';

function getDocs() {
  return google.docs({ version: 'v1', auth: requireAuth() });
}

function getSheets() {
  return google.sheets({ version: 'v4', auth: requireAuth() });
}

function getSlides() {
  return google.slides({ version: 'v1', auth: requireAuth() });
}

export function registerWorkspaceTools(server: McpServer): void {
  // ═══════════════════════════════════════════════════════════════════════════
  // DOCS
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── google_docs_create ───────────────────────────────────────────────────
  server.registerTool(
    'google_docs_create',
    {
      title: 'Create a Google Doc',
      description: `Creates a new Google Docs document with optional initial content.

Args:
  - title: Document title (required)
  - content: Initial plain text content to add to the document

Returns:
  - document_id: ID to use in google_docs_get and google_docs_append_text
  - web_view_link: URL to open the document`,
      inputSchema: z.object({
        title: z.string().min(1).describe('Document title.'),
        content: z.string().optional().describe('Initial document content.'),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ title, content }) => {
      try {
        const docs = getDocs();
        const createRes = await docs.documents.create({ requestBody: { title } });
        const docId = createRes.data.documentId!;

        if (content) {
          await docs.documents.batchUpdate({
            documentId: docId,
            requestBody: {
              requests: [{ insertText: { location: { index: 1 }, text: content } }],
            },
          });
        }

        const webViewLink = `https://docs.google.com/document/d/${docId}/edit`;

        return {
          content: [
            {
              type: 'text',
              text: `Google Doc created: **${title}**\n- ID: \`${docId}\`\n- [Open Document](${webViewLink})`,
            },
          ],
          structuredContent: { document_id: docId, title, web_view_link: webViewLink },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );

  // ─── google_docs_get ──────────────────────────────────────────────────────
  server.registerTool(
    'google_docs_get',
    {
      title: 'Get Google Doc Content',
      description: `Retrieves the text content of a Google Docs document, including all tabs.

Args:
  - document_id: Document ID (from google_docs_create or google_drive_search_files)
  - tab: Optional tab title or tab ID to focus on a single tab. If omitted, all tabs are returned.
  - response_format: 'markdown' or 'json'

Returns the document title and content. Top-level tabs are fetched; nested child tabs are not included.
When multiple tabs exist, each is labeled with its title. When 'tab' is specified and not found, returns an error.
For 'json' format, returns a structured tabs array with tab_id, title, index, and text_content per tab.
  - response_format: 'markdown' (default) or 'json'`,
      inputSchema: z.object({
        document_id: z.string().min(1).describe('Document ID.'),
        tab: z.string().optional().describe('Tab title or tab ID to focus on. Omit to return all tabs.'),
        response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ document_id, tab, response_format }) => {
      try {
        const docs = getDocs();
        const res = await docs.documents.get({
          documentId: document_id,
          includeTabsContent: true,
        });
        const doc = res.data;

        // Build tabs array from API response
        const rawTabs = doc.tabs ?? [];
        const tabsData: TabData[] = rawTabs.length > 0
          ? rawTabs.map((t, i) => ({
              tab_id: t.tabProperties?.tabId ?? `tab_${i}`,
              title: t.tabProperties?.title ?? `Tab ${i + 1}`,
              index: t.tabProperties?.index ?? i,
              text_content: extractTabText(t),
            }))
          : [
              // Fallback for docs that don't return tabs (older docs / no tabs)
              {
                tab_id: 'tab_0',
                title: 'Main',
                index: 0,
                text_content: extractTabText({ documentTab: { body: doc.body ?? null } }),
              },
            ];

        const formattedContent = formatDocTabs(tabsData, tab);

        // Return isError if the requested tab was not found
        if (tab && formattedContent.startsWith(`Tab "${tab}" not found`)) {
          return { isError: true, content: [{ type: 'text', text: formattedContent }] };
        }

        const effectiveTabs = tab
          ? tabsData.filter((t) => t.title.toLowerCase() === tab.toLowerCase() || t.tab_id === tab)
          : tabsData;

        let text: string;
        if (response_format === ResponseFormat.MARKDOWN) {
          const titleSuffix = effectiveTabs.length === 1 && tab ? effectiveTabs[0].title : undefined;
          const heading = titleSuffix
            ? `# ${doc.title ?? 'Untitled'} > ${titleSuffix}`
            : `# ${doc.title ?? 'Untitled'}`;
          text = `${heading}\n\n${formattedContent}`;
        } else {
          text = JSON.stringify(
            {
              document_id: doc.documentId,
              title: doc.title,
              revision_id: doc.revisionId,
              tabs: effectiveTabs,
            },
            null,
            2
          );
        }

        return {
          content: [{ type: 'text', text: truncateIfNeeded(text) }],
          structuredContent: {
            document_id: doc.documentId,
            title: doc.title,
            tabs: effectiveTabs,
          },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );

  // ─── google_docs_append_text ──────────────────────────────────────────────
  server.registerTool(
    'google_docs_append_text',
    {
      title: 'Append Text to a Google Doc',
      description: `Appends text to the end of a Google Docs document.

Args:
  - document_id: Document ID
  - text: Text to append (supports newlines with \\n)
  - add_newline_before: Add a blank line before the appended text (default: true)`,
      inputSchema: z.object({
        document_id: z.string().min(1).describe('Document ID.'),
        text: z.string().min(1).describe('Text to append.'),
        add_newline_before: z.boolean().default(true),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ document_id, text, add_newline_before }) => {
      try {
        const docs = getDocs();

        // Get current document to find the end index
        const current = await docs.documents.get({ documentId: document_id });
        const endIndex = current.data.body?.content?.at(-1)?.endIndex ?? 1;
        const insertIndex = endIndex - 1; // Before the final newline

        const insertText = add_newline_before ? `\n${text}` : text;

        await docs.documents.batchUpdate({
          documentId: document_id,
          requestBody: {
            requests: [{ insertText: { location: { index: insertIndex }, text: insertText } }],
          },
        });

        return {
          content: [
            {
              type: 'text',
              text: `Text appended to document \`${document_id}\`.\n- [Open Document](https://docs.google.com/document/d/${document_id}/edit)`,
            },
          ],
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // SHEETS
  // ═══════════════════════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════════════════════
  // SLIDES
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── google_slides_create ─────────────────────────────────────────────────
  server.registerTool(
    'google_slides_create',
    {
      title: 'Create a Google Slides Presentation',
      description: `Creates a new Google Slides presentation.

Args:
  - title: Presentation title (required)

Returns:
  - presentation_id: ID to use with google_slides_get
  - web_view_link: URL to open the presentation`,
      inputSchema: z.object({
        title: z.string().min(1).describe('Presentation title.'),
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ title }) => {
      try {
        const slides = getSlides();
        const res = await slides.presentations.create({ requestBody: { title } });
        const presentationId = res.data.presentationId!;
        const webViewLink = `https://docs.google.com/presentation/d/${presentationId}/edit`;

        return {
          content: [
            {
              type: 'text',
              text: `Presentation created: **${title}**\n- ID: \`${presentationId}\`\n- [Open Presentation](${webViewLink})`,
            },
          ],
          structuredContent: { presentation_id: presentationId, title, web_view_link: webViewLink },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );

  // ─── google_slides_get ────────────────────────────────────────────────────
  server.registerTool(
    'google_slides_get',
    {
      title: 'Get Google Slides Presentation',
      description: `Retrieves metadata and slide content from a Google Slides presentation.

Args:
  - presentation_id: Presentation ID (from google_slides_create or Google Drive)
  - response_format: 'markdown' (slide summaries) or 'json' (full structure)

Returns:
  - title: Presentation title
  - slide_count: Number of slides
  - slides[]: Each slide's index, ID, and extracted text content`,
      inputSchema: z.object({
        presentation_id: z.string().min(1).describe('Presentation ID.'),
        response_format: z.nativeEnum(ResponseFormat).default(ResponseFormat.MARKDOWN),
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ presentation_id, response_format }) => {
      try {
        const slides = getSlides();
        const res = await slides.presentations.get({ presentationId: presentation_id });
        const pres = res.data;

        const slideData = (pres.slides ?? []).map((slide, index) => {
          const texts: string[] = [];
          for (const element of slide.pageElements ?? []) {
            if (element.shape?.text) {
              for (const run of element.shape.text.textElements ?? []) {
                if (run.textRun?.content) {
                  texts.push(run.textRun.content.trim());
                }
              }
            }
          }
          return {
            index: index + 1,
            slide_id: slide.objectId ?? '',
            text_content: texts.filter(Boolean).join('\n'),
          };
        });

        let text: string;
        if (response_format === ResponseFormat.MARKDOWN) {
          const lines = [`# ${pres.title ?? 'Untitled Presentation'}`, `${slideData.length} slides`, ''];
          for (const s of slideData) {
            lines.push(`## Slide ${s.index}`);
            lines.push(s.text_content || '*(No text content)*');
            lines.push('');
          }
          text = lines.join('\n');
        } else {
          text = JSON.stringify(
            {
              presentation_id: pres.presentationId,
              title: pres.title,
              slide_count: slideData.length,
              slides: slideData,
            },
            null,
            2
          );
        }

        return {
          content: [{ type: 'text', text: truncateIfNeeded(text) }],
          structuredContent: {
            presentation_id: pres.presentationId,
            title: pres.title,
            slide_count: slideData.length,
            slides: slideData,
          },
        };
      } catch (error) {
        return { isError: true, content: [{ type: 'text', text: handleGoogleError(error) }] };
      }
    }
  );

  // ─── google_slides_append_slides ──────────────────────────────────────────
  server.registerTool(
    'google_slides_append_slides',
    {
      title: 'Append Slides with Content',
      description: `Adds one or more slides to an existing Google Slides presentation with title and optional body text.

Args:
  - presentation_id: Presentation ID (from google_slides_create or Google Drive)
  - slides: Array of { title, body? }. body supports newlines for bullet points.

Returns:
  - slide_count_added: Number of slides added
  - web_view_link: URL to open the presentation`,
      inputSchema: z
        .object({
          presentation_id: z.string().min(1).describe('Presentation ID.'),
          slides: z
            .array(
              z.object({
                title: z.string().describe('Slide title.'),
                body: z.string().optional().describe('Slide body text (newlines for bullets).'),
              })
            )
            .min(1)
            .max(20)
            .describe('Slides to append (title and optional body per slide).'),
        })
        .strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ presentation_id, slides: slidesInput }) => {
      try {
        const slidesApi = getSlides();

        const getRes = await slidesApi.presentations.get({ presentationId: presentation_id });
        const currentCount = (getRes.data.slides ?? []).length;

        const requests: object[] = [];

        for (let i = 0; i < slidesInput.length; i++) {
          const slideId = `slide_${i}_${Date.now()}`;
          const titleId = `title_${i}_${Date.now()}`;
          const bodyId = `body_${i}_${Date.now()}`;

          requests.push({
            createSlide: {
              objectId: slideId,
              insertionIndex: currentCount + i,
              slideLayoutReference: { predefinedLayout: 'TITLE_AND_BODY' },
              placeholderIdMappings: [
                { layoutPlaceholder: { type: 'TITLE', index: 0 }, objectId: titleId },
                { layoutPlaceholder: { type: 'BODY', index: 0 }, objectId: bodyId },
              ],
            },
          });
          requests.push({
            insertText: {
              objectId: titleId,
              text: slidesInput[i].title,
              insertionIndex: 0,
            },
          });
          requests.push({
            insertText: {
              objectId: bodyId,
              text: slidesInput[i].body ?? '',
              insertionIndex: 0,
            },
          });
        }

        await slidesApi.presentations.batchUpdate({
          presentationId: presentation_id,
          requestBody: { requests },
        });

        const webViewLink = `https://docs.google.com/presentation/d/${presentation_id}/edit`;

        return {
          content: [
            {
              type: 'text',
              text: `Added **${slidesInput.length}** slide(s) to the presentation.\n- [Open Presentation](${webViewLink})`,
            },
          ],
          structuredContent: {
            slide_count_added: slidesInput.length,
            web_view_link: webViewLink,
          },
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extracts plain text from a single Google Docs tab.
 */
export function extractTabText(tab: {
  documentTab?: {
    body?: {
      content?: Array<{
        paragraph?: {
          elements?: Array<{
            textRun?: { content?: string | null } | null;
          }> | null;
        } | null;
      }> | null;
    } | null;
  } | null;
}): string {
  const lines: string[] = [];
  for (const element of tab.documentTab?.body?.content ?? []) {
    if (element.paragraph) {
      const text = (element.paragraph.elements ?? [])
        .map((el) => el.textRun?.content ?? '')
        .join('');
      if (text.trim()) lines.push(text);
    }
  }
  return lines.join('').trim();
}

export interface TabData {
  tab_id: string;
  title: string;
  index: number;
  text_content: string;
}

/**
 * Formats tabs data into a markdown string.
 * - Single tab: returns content directly (no header)
 * - Multiple tabs: prefixes each with "## Tab: {title}"
 * - With filter: returns only the matching tab, or an error message
 */
export function formatDocTabs(tabs: TabData[], tabFilter?: string): string {
  if (tabFilter) {
    const lower = tabFilter.toLowerCase();
    const match = tabs.find(
      (t) => t.title.toLowerCase() === lower || t.tab_id === tabFilter
    );
    if (!match) {
      const available = tabs.map((t) => `${t.title} (${t.tab_id})`).join(', ');
      return `Tab "${tabFilter}" not found. Available tabs: ${available}`;
    }
    return match.text_content;
  }

  if (tabs.length === 1) {
    return tabs[0].text_content;
  }

  return tabs
    .map((t) => `## Tab: ${t.title}\n${t.text_content}`)
    .join('\n\n');
}
