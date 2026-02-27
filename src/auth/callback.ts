import http from 'http';
import { exchangeCode } from './oauth.js';
import { OAUTH_CALLBACK_PORT } from '../constants.js';

let _server: http.Server | null = null;
let _authError: string | null = null;
let _authComplete = false;

/**
 * Starts a one-time local HTTP server to handle the Google OAuth2 callback.
 * The server shuts itself down after receiving one callback.
 */
export function startCallbackServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (_server) {
      resolve();
      return;
    }

    _authError = null;
    _authComplete = false;

    _server = http.createServer(async (req, res) => {
      const url = req.url ?? '';

      if (!url.startsWith('/callback')) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const parsed = new URL(url, `http://localhost:${OAUTH_CALLBACK_PORT}`);
      const code = parsed.searchParams.get('code');
      const error = parsed.searchParams.get('error');

      if (error) {
        _authError = error;
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(htmlPage('Authorization Failed', `<p style="color:red">Error: ${error}</p><p>Return to Claude and try again.</p>`));
        stopCallbackServer();
        return;
      }

      if (!code) {
        _authError = 'No authorization code received';
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(htmlPage('Authorization Failed', '<p>No authorization code was received. Return to Claude and try again.</p>'));
        stopCallbackServer();
        return;
      }

      try {
        await exchangeCode(code);
        _authComplete = true;
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(htmlPage('Authorization Successful!', '<p style="color:green">✓ Google Workspace connected successfully.</p><p>You can close this tab and return to Claude.</p>'));
      } catch (err) {
        _authError = err instanceof Error ? err.message : String(err);
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end(htmlPage('Authorization Failed', `<p style="color:red">Token exchange failed: ${_authError}</p>`));
      }

      stopCallbackServer();
    });

    _server.on('error', (err) => {
      _server = null;
      reject(new Error(`Failed to start callback server on port ${OAUTH_CALLBACK_PORT}: ${err.message}`));
    });

    _server.listen(OAUTH_CALLBACK_PORT, '127.0.0.1', () => resolve());
  });
}

export function stopCallbackServer(): void {
  if (_server) {
    _server.close();
    _server = null;
  }
}

export function getAuthStatus(): { complete: boolean; error: string | null } {
  return { complete: _authComplete, error: _authError };
}

function htmlPage(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 500px; margin: 80px auto; padding: 0 20px; }
    h1 { font-size: 1.5rem; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  ${body}
</body>
</html>`;
}
