import { google } from 'googleapis';
import { requireAuth } from '../../auth/oauth.js';

export function getSheets() {
  return google.sheets({ version: 'v4', auth: requireAuth() });
}

export function parseHeaders(headers: string): string[] {
  return headers.split(',').map((h) => h.trim());
}

export function quoteSheetName(name: string): string {
  return `'${name.replace(/'/g, "''")}'`;
}

export function formatAddSheetResponse(spreadsheetId: string, sheetName: string, sheetId: number) {
  const webViewLink = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheetId}`;
  return {
    text: `Tab created: **${sheetName}**\n- Sheet ID: \`${sheetId}\`\n- [Open Spreadsheet](${webViewLink})`,
    structuredContent: { sheet_id: sheetId, sheet_name: sheetName, spreadsheet_id: spreadsheetId, web_view_link: webViewLink },
  };
}

export function formatDeleteSheetResponse(spreadsheetId: string, sheetId: number) {
  const webViewLink = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
  return {
    text: `Tab with sheet ID \`${sheetId}\` deleted.\n- [Open Spreadsheet](${webViewLink})`,
  };
}
