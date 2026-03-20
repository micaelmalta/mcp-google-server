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
 *   The server implements OAuth 2.1 — MCP clients (Cursor, Claude Desktop) trigger
 *   a browser-based Google sign-in automatically on first use.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import cors from 'cors';
import { authorizationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/authorize.js';
import { tokenHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/token.js';
import { clientRegistrationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/register.js';
import { revocationHandler } from '@modelcontextprotocol/sdk/server/auth/handlers/revoke.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';

import { registerAuthTools } from './tools/auth/index.js';
import { registerCalendarTools } from './tools/calendar/index.js';
import { registerGmailTools } from './tools/gmail/index.js';
import { registerDriveTools } from './tools/drive/index.js';
import { registerDocsTools } from './tools/docs/index.js';
import { registerSheetsTools } from './tools/sheets/index.js';
import { registerSlidesTools } from './tools/slides/index.js';
import { registerDirectoryTools } from './tools/directory/index.js';
import { GoogleOAuthProvider, clientFromBearerToken } from './auth/google-oauth-provider.js';
import { authContext } from './auth/context.js';
import { loadConfig, shouldRegisterTool, getScopesForConfig, type ServerConfig } from './config.js';

function log(level: 'info' | 'warn' | 'error', msg: string, extra?: Record<string, unknown>): void {
  process.stderr.write(JSON.stringify({ level, msg, ...extra }) + '\n');
}

function createServer(
  opts: { includeAuthTools: boolean; config?: ServerConfig } = { includeAuthTools: true }
): McpServer {
  const server = new McpServer({
    name: 'google-workspace-mcp-server',
    version: '1.0.0',
  });

  const config = opts.config ?? {};

  if (config.readOnly !== undefined || config.enabledTools !== undefined) {
    // Wrap registerTool to filter by config — zero changes to individual tool files
    const originalRegister = server.registerTool.bind(server);
    server.registerTool = (name: string, opts: unknown, handler: unknown) => {
      if (!shouldRegisterTool(name, config)) return undefined as never;
      return (originalRegister as (...args: unknown[]) => unknown)(name, opts, handler) as ReturnType<typeof originalRegister>;
    };
  }

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
    log('warn', 'GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set — Google API access will be unavailable');
  }

  const server = createServer({ includeAuthTools: true });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log('info', 'Server running via stdio');
}

async function runHttp(port: number): Promise<void> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    log('error', 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required in HTTP mode');
    process.exit(1);
  }

  const config = loadConfig();
  const scopes = getScopesForConfig(config);
  if (config.readOnly || config.enabledTools) {
    log('info', 'Config loaded', {
      readOnly: config.readOnly ?? false,
      enabledTools: config.enabledTools ?? 'all',
    });
  }

  const issuerUrl = new URL(`http://localhost:${port}`);
  const callbackUrl = new URL('/oauth/callback', issuerUrl).href;
  const oauthProvider = new GoogleOAuthProvider(clientId, clientSecret, callbackUrl);

  const app = express();
  app.use(express.json());

  // --- OAuth 2.1 endpoints (manually mounted instead of mcpAuthRouter to avoid
  //     SDK getter evaluation timing issues with registration_endpoint) ---

  // OAuth metadata (RFC 8414)
  const oauthMetadata = {
    issuer: issuerUrl.href,
    authorization_endpoint: new URL('/authorize', issuerUrl).href,
    token_endpoint: new URL('/token', issuerUrl).href,
    registration_endpoint: new URL('/register', issuerUrl).href,
    revocation_endpoint: new URL('/revoke', issuerUrl).href,
    response_types_supported: ['code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    scopes_supported: scopes,
    revocation_endpoint_auth_methods_supported: ['client_secret_post'],
  };

  // Protected resource metadata (RFC 9728)
  const protectedResourceMetadata = {
    resource: issuerUrl.href,
    authorization_servers: [issuerUrl.href],
    scopes_supported: scopes,
    resource_name: 'Google Workspace MCP Server',
  };

  app.get('/.well-known/oauth-authorization-server', cors(), (_req, res) => {
    res.json(oauthMetadata);
  });
  app.get('/.well-known/oauth-protected-resource', cors(), (_req, res) => {
    res.json(protectedResourceMetadata);
  });

  app.use('/authorize', authorizationHandler({ provider: oauthProvider }));
  app.use('/token', tokenHandler({ provider: oauthProvider }));
  app.use('/register', clientRegistrationHandler({ clientsStore: oauthProvider.clientsStore }));
  app.use('/revoke', revocationHandler({ provider: oauthProvider }));

  // Google redirects here after sign-in. We forward the code to the MCP client's
  // original redirect_uri (e.g. cursor://) which Google doesn't support directly.
  app.get('/oauth/callback', (req, res) => {
    const { code, state, error } = req.query;
    if (error) {
      res.status(400).json({ error: 'authorization_error', description: 'Google authorization failed' });
      return;
    }
    if (!code || !state || typeof code !== 'string' || typeof state !== 'string') {
      res.status(400).send('Missing code or state parameter');
      return;
    }
    oauthProvider.handleCallback(code, state, res);
  });

  // --- Health & MCP ---

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.post('/mcp',
    requireBearerAuth({ verifier: oauthProvider }),
    async (req, res) => {
      const oauthClient = clientFromBearerToken(req.auth!.token, clientId, clientSecret);

      // A new server+transport is required per request: the SDK throws if connect() is
      // called on an already-connected Protocol instance, so reuse is not possible in
      // stateless mode (sessionIdGenerator: undefined). See protocol.js:216.
      const server = createServer({ includeAuthTools: false, config });
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

      try {
        await server.connect(transport);
        await authContext.run(oauthClient, () => transport.handleRequest(req, res, req.body));
      } catch (error) {
        log('error', 'Error handling request', { error: String(error) });
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
    }
  );

  // Catch-all error handler — logs anything not already handled above
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction): void => {
    log('error', 'Unhandled Express error', { error: String(err) });
    if (!res.headersSent) {
      res.status(500).json({ error: 'server_error', error_description: 'Internal Server Error' });
    }
  });

  const httpServer = app.listen(port, () => {
    log('info', 'Server running via HTTP', {
      port,
      oauthMetadata: `http://localhost:${port}/.well-known/oauth-authorization-server`,
    });
  });

  process.on('SIGTERM', () => {
    log('info', 'SIGTERM received, shutting down gracefully');
    httpServer.close();
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
      log('warn', `Unknown TRANSPORT="${transport}", defaulting to stdio`);
    }
    await runStdio();
  }
}

main().catch((error: unknown) => {
  log('error', 'Fatal error', { error: String(error) });
  process.exit(1);
});
