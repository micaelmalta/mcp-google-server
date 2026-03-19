#!/usr/bin/env node
/**
 * Google Workspace MCP Server
 *
 * Provides tools for interacting with Google Calendar, Gmail, Drive,
 * Docs, Sheets, and Slides via the Google APIs with OAuth2 authentication.
 *
 * Stdio mode (default):
 *   GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... node dist/index.js
 *   First run: call google_auth_start to authorize, then use all other tools.
 *
 * HTTP mode:
 *   TRANSPORT=http PORT=3000 GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... node dist/index.js
 *   Each request must include an X-Google-Tokens header with the OAuth token JSON.
 *   The server is stateless — no tokens are stored on disk.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';

import { registerAuthTools } from './tools/auth/index.js';
import { registerCalendarTools } from './tools/calendar/index.js';
import { registerGmailTools } from './tools/gmail/index.js';
import { registerDriveTools } from './tools/drive/index.js';
import { registerDocsTools } from './tools/docs/index.js';
import { registerSheetsTools } from './tools/sheets/index.js';
import { registerSlidesTools } from './tools/slides/index.js';
import { registerDirectoryTools } from './tools/directory/index.js';
import { buildClientFromTokens } from './auth/oauth.js';
import { authContext } from './auth/context.js';

function createServer(opts: { includeAuthTools: boolean } = { includeAuthTools: true }): McpServer {
  const server = new McpServer({
    name: 'google-workspace-mcp-server',
    version: '1.0.0',
  });

  if (opts.includeAuthTools) {
    registerAuthTools(server);
  }
  registerCalendarTools(server);
  registerGmailTools(server);
  registerDriveTools(server);
  registerDocsTools(server);
  registerSheetsTools(server);
  registerSlidesTools(server);
  registerDirectoryTools(server);

  return server;
}

async function runStdio(): Promise<void> {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.error(
      '[google-workspace-mcp] WARNING: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set. ' +
        'Set these environment variables to enable Google API access. ' +
        'See .env.example for instructions.'
    );
  }

  const server = createServer({ includeAuthTools: true });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[google-workspace-mcp] Server running via stdio');
}

async function runHttp(port: number): Promise<void> {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.error(
      '[google-workspace-mcp] WARNING: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set.'
    );
  }

  const app = createMcpExpressApp({ host: '0.0.0.0' });

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.post('/mcp', async (req, res) => {
    const tokenHeader = req.headers['x-google-tokens'];
    if (!tokenHeader || typeof tokenHeader !== 'string') {
      res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Missing X-Google-Tokens header' },
        id: null,
      });
      return;
    }

    if (tokenHeader.length > 8192) {
      res.status(413).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'X-Google-Tokens header exceeds 8192 byte limit' },
        id: null,
      });
      return;
    }

    let client;
    try {
      client = buildClientFromTokens(tokenHeader);
    } catch (err) {
      const isConfigError = err instanceof Error && err.message.includes('environment variables are required');
      if (isConfigError) {
        console.error('[google-workspace-mcp] Server misconfiguration:', err);
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Server misconfiguration: missing Google credentials' },
          id: null,
        });
      } else {
        res.status(401).json({
          jsonrpc: '2.0',
          error: { code: -32001, message: 'Invalid X-Google-Tokens header: must be valid token JSON' },
          id: null,
        });
      }
      return;
    }

    const server = createServer({ includeAuthTools: false });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    try {
      await server.connect(transport);
      await authContext.run(client, () => transport.handleRequest(req, res, req.body));
    } catch (error) {
      console.error('[google-workspace-mcp] Error handling request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    } finally {
      try { await transport.close(); } catch { /* ignore */ }
      try { await server.close(); } catch { /* ignore */ }
    }
  });

  app.listen(port, () => {
    console.error(`[google-workspace-mcp] Server running via HTTP on port ${port}`);
  });
}

async function main(): Promise<void> {
  const transport = process.env.TRANSPORT ?? 'stdio';
  if (transport === 'http') {
    const rawPort = parseInt(process.env.PORT ?? '3000', 10);
    const port = Number.isNaN(rawPort) ? 3000 : rawPort;
    await runHttp(port);
  } else {
    if (transport !== 'stdio') {
      console.error(`[google-workspace-mcp] Unknown TRANSPORT="${transport}", defaulting to stdio`);
    }
    await runStdio();
  }
}

main().catch((error: unknown) => {
  console.error('[google-workspace-mcp] Fatal error:', error);
  process.exit(1);
});
