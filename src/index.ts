#!/usr/bin/env node
/**
 * Google Workspace MCP Server
 *
 * Provides tools for interacting with Google Calendar, Gmail, Drive,
 * Docs, Sheets, and Slides via the Google APIs with OAuth2 authentication.
 *
 * Usage:
 *   GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... node dist/index.js
 *
 * First run: call google_auth_start to authorize, then use all other tools.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { registerAuthTools } from './tools/auth/index.js';
import { registerCalendarTools } from './tools/calendar/index.js';
import { registerGmailTools } from './tools/gmail/index.js';
import { registerDriveTools } from './tools/drive/index.js';
import { registerDocsTools } from './tools/docs/index.js';
import { registerSheetsTools } from './tools/sheets/index.js';
import { registerSlidesTools } from './tools/slides/index.js';
import { registerDirectoryTools } from './tools/directory/index.js';

const server = new McpServer({
  name: 'google-workspace-mcp-server',
  version: '1.0.0',
});

// Register all tool groups
registerAuthTools(server);
registerCalendarTools(server);
registerGmailTools(server);
registerDriveTools(server);
registerDocsTools(server);
registerSheetsTools(server);
registerSlidesTools(server);
registerDirectoryTools(server);

async function main(): Promise<void> {
  // Validate required env vars on startup (warn only — auth tools provide better errors)
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.error(
      '[google-workspace-mcp] WARNING: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set. ' +
        'Set these environment variables to enable Google API access. ' +
        'See .env.example for instructions.'
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[google-workspace-mcp] Server running via stdio');
}

main().catch((error: unknown) => {
  console.error('[google-workspace-mcp] Fatal error:', error);
  process.exit(1);
});
