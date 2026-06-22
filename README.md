# Google Workspace MCP Server

An MCP (Model Context Protocol) server that connects AI clients to your Google Workspace. Supports Calendar, Gmail, Drive, Docs, Sheets, Slides, and Contacts/Directory.

Runs in two modes:
- **Stdio** (default) — for local use with Claude CLI/Desktop. Auth via `google_auth_start` tool, tokens stored on disk.
- **HTTP** — for shared deployments and MCP clients like Cursor. Implements OAuth 2.1 so clients handle Google sign-in automatically.

## Setup

### 1. Create Google Cloud Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new project (or select existing)
3. Enable these APIs:
   - Google Calendar API
   - Gmail API
   - Google Drive API
   - Google Docs API
   - Google Sheets API
   - Google Slides API
   - Google People API
4. Go to **Credentials** → **Create Credentials** → **OAuth client ID**
5. Application type: **Web application**
6. Add Authorized redirect URIs:
   - `http://localhost:8080/callback` (for stdio mode)
   - `http://localhost:3000/oauth/callback` (for HTTP mode — adjust port if needed)
7. Download the credentials and note your **Client ID** and **Client Secret**

### 2. Configure OAuth Consent Screen

1. Go to **OAuth consent screen**
2. User type: **External** (or Internal for Google Workspace orgs)
3. Add your email as a test user
4. Add the following scopes:
   - `https://www.googleapis.com/auth/calendar`
   - `https://www.googleapis.com/auth/documents`
   - `https://www.googleapis.com/auth/spreadsheets`
   - `https://www.googleapis.com/auth/presentations`
   - `https://www.googleapis.com/auth/drive`
   - `https://www.googleapis.com/auth/gmail.modify`
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/contacts.readonly`
   - `https://www.googleapis.com/auth/directory.readonly`

### 3. Install and Build

**Option A — Run directly from GitHub (no local clone needed):**

Skip this step entirely. Use `npx github:justworkshr/mcp-google-server` as the command in step 4 below. npm will download, install, and build the server automatically on first run.

**Option B — Local install:**

```bash
npm install
npm run build
```

---

## Stdio Mode (Claude CLI / Claude Desktop)

Stdio mode runs as a subprocess managed by the MCP client. Auth is handled via the `google_auth_start` tool and tokens are persisted to `~/.google-mcp-tokens.json`.

### Claude CLI

From GitHub (no local clone):

```bash
claude mcp add google-workspace \
  --env GOOGLE_CLIENT_ID=your_client_id_here \
  --env GOOGLE_CLIENT_SECRET=your_client_secret_here \
  -- npx -y github:justworkshr/mcp-google-server
```

From local install:

```bash
claude mcp add google-workspace \
  --env GOOGLE_CLIENT_ID=your_client_id_here \
  --env GOOGLE_CLIENT_SECRET=your_client_secret_here \
  -- node /path/to/mcp-google-server/dist/index.js
```

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "google-workspace": {
      "command": "npx",
      "args": ["-y", "github:justworkshr/mcp-google-server"],
      "env": {
        "GOOGLE_CLIENT_ID": "your_client_id_here",
        "GOOGLE_CLIENT_SECRET": "your_client_secret_here"
      }
    }
  }
}
```

### Authorize

In Claude, run: **"Use the google_auth_start tool"**

Open the URL it returns, sign in with Google, and grant permissions. Tokens are saved to `~/.google-mcp-tokens.json` and auto-refresh. You only need to re-authorize if:

- You run `google_auth_revoke`
- The refresh token expires (6 months of inactivity)
- You revoke access from [Google Account Security](https://myaccount.google.com/permissions)

---

## HTTP Mode (Cursor / Shared Deployments)

HTTP mode runs as a standalone server with built-in OAuth 2.1. MCP clients connect via URL and the server handles the Google sign-in flow automatically — no manual token management needed.

### How it works

1. MCP client connects to `http://localhost:3000/mcp`
2. Server advertises OAuth 2.1 metadata at `/.well-known/oauth-authorization-server`
3. Client registers via `/register` and redirects the user to `/authorize`
4. Server proxies to Google's sign-in page
5. After sign-in, Google redirects to `/oauth/callback`, which forwards the auth code back to the client
6. Client exchanges the code for tokens via `/token`
7. Client sends `Authorization: Bearer <token>` on each `/mcp` request

The server is fully stateless — no tokens or sessions stored on disk. Each user gets their own Google access token. Server restarts don't break existing client sessions (clients re-register transparently).

### Starting the server

```bash
TRANSPORT=http \
PORT=3000 \
GOOGLE_CLIENT_ID=your_client_id \
GOOGLE_CLIENT_SECRET=your_client_secret \
node dist/index.js
```

### Cursor

Add to your Cursor MCP config (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "google-workspace": {
      "type": "http",
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

On first tool use, Cursor will open a browser window for Google sign-in. After that, it handles token refresh automatically.

### Endpoints

| Endpoint | Description |
|---|---|
| `GET /.well-known/oauth-authorization-server` | OAuth 2.1 server metadata |
| `GET /.well-known/oauth-protected-resource` | Protected resource metadata |
| `POST /register` | Dynamic client registration |
| `GET /authorize` | Redirects to Google sign-in |
| `POST /token` | Token exchange and refresh |
| `POST /revoke` | Token revocation |
| `GET /oauth/callback` | Google redirect proxy (forwards auth code to MCP client) |
| `GET /health` | Liveness/readiness probe |
| `POST /mcp` | MCP endpoint (requires `Authorization: Bearer` header) |

### Security

- **Redirect URI allowlist** — only `cursor://`, `vscode://`, `https://`, and `http://localhost` are accepted
- **Token audience check** — Bearer tokens are validated against the server's Google client ID
- **No secret exposure** — the Google client_secret is never sent to MCP clients
- **Per-request auth isolation** — each request is scoped via `AsyncLocalStorage`, no cross-user leakage

---

## Available Tools

### Authentication (stdio mode only)

| Tool                 | Description                                   |
| -------------------- | --------------------------------------------- |
| `google_auth_start`  | Start OAuth2 flow — returns authorization URL |
| `google_auth_status` | Check if authenticated and token details      |
| `google_auth_revoke` | Delete stored tokens (re-auth required after) |

### Google Calendar

| Tool                             | Description                          |
| -------------------------------- | ------------------------------------ |
| `google_calendar_list_calendars` | List all your calendars              |
| `google_calendar_list_events`    | List events with date/search filters |
| `google_calendar_get_event`      | Get full event details               |
| `google_calendar_create_event`   | Create a new event with attendees    |
| `google_calendar_update_event`   | Update event title, time, attendees  |
| `google_calendar_approve_event`  | Accept a calendar event invitation   |
| `google_calendar_decline_event`  | Decline a calendar event invitation  |
| `google_calendar_delete_event`   | Delete an event                      |
| `google_calendar_get_freebusy`   | Check free/busy for scheduling       |

### Gmail

| Tool                         | Description                                  |
| ---------------------------- | -------------------------------------------- |
| `google_gmail_list_messages` | Search and list messages                     |
| `google_gmail_get_message`   | Read full message content                    |
| `google_gmail_send_email`    | Send an email                                |
| `google_gmail_reply_email`   | Reply to an existing thread                  |
| `google_gmail_list_threads`  | List conversation threads                    |
| `google_gmail_get_thread`    | Read full conversation thread                |
| `google_gmail_modify_labels` | Add/remove labels (archive, star, mark read) |
| `google_gmail_list_labels`   | List all labels with IDs                     |

### Google Drive

| Tool                            | Description                     |
| ------------------------------- | ------------------------------- |
| `google_drive_list_files`       | List files in a folder          |
| `google_drive_search_files`     | Search with Drive query syntax  |
| `google_drive_get_file`         | Get file metadata               |
| `google_drive_create_folder`    | Create a new folder             |
| `google_drive_move_file`        | Move file to a different folder |
| `google_drive_delete_file`      | Move file to Trash              |
| `google_drive_share_file`       | Share with user/group/anyone    |
| `google_drive_list_permissions` | List file sharing permissions   |

### Google Docs

| Tool                      | Description             |
| ------------------------- | ----------------------- |
| `google_docs_create`      | Create a new document   |
| `google_docs_get`         | Read document content   |
| `google_docs_append_text` | Append text to document |

### Google Sheets

| Tool                          | Description                           |
| ----------------------------- | ------------------------------------- |
| `google_sheets_create`        | Create a new spreadsheet              |
| `google_sheets_get_values`    | Read cell values (A1 notation)        |
| `google_sheets_update_values` | Write/overwrite cell values           |
| `google_sheets_append_values` | Append new rows                       |
| `google_sheets_add_sheet`     | Add a new tab/sheet to a spreadsheet  |
| `google_sheets_delete_sheet`  | Delete a tab/sheet from a spreadsheet |

### Google Slides

| Tool                          | Description                            |
| ----------------------------- | -------------------------------------- |
| `google_slides_create`        | Create a new presentation              |
| `google_slides_get`           | Get slides and their text content      |
| `google_slides_append_slides` | Add slides to an existing presentation |

### Google Directory & Contacts

| Tool                      | Description                                           |
| ------------------------- | ----------------------------------------------------- |
| `google_directory_list`   | List people in your Google Workspace domain directory |
| `google_directory_search` | Search your domain directory by name or email         |
| `google_contacts_list`    | List your personal Google contacts                    |
| `google_contacts_search`  | Search your personal Google contacts by name          |

---

## Environment Variables

| Variable               | Required | Default                          | Description                                         |
| ---------------------- | -------- | -------------------------------- | --------------------------------------------------- |
| `GOOGLE_CLIENT_ID`     | Yes      | —                                | OAuth2 Client ID from Google Cloud Console          |
| `GOOGLE_CLIENT_SECRET` | Yes      | —                                | OAuth2 Client Secret                                |
| `TRANSPORT`            | No       | `stdio`                          | Set to `http` to run as an HTTP server              |
| `PORT`                 | No       | `3000`                           | HTTP server port (HTTP mode only)                   |
| `GOOGLE_REDIRECT_URI`      | No       | `http://localhost:8080/callback` | OAuth callback URL (stdio mode only)                |
| `GOOGLE_OAUTH_LISTEN_PORT` | No       | derived from redirect URI or `8080` | HTTP listen port for stdio OAuth callback (stdio mode only) |
| `GOOGLE_TOKENS_PATH`       | No       | `~/.google-mcp-tokens.json` or `/tmp/google-mcp-tokens.json` | Where to store OAuth tokens (stdio mode only)       |

---

## Development

```bash
# Run in development mode with auto-reload
npm run dev

# Build TypeScript
npm run build

# Run tests
npm test

# Lint
npm run lint

# Test with MCP Inspector
npx @modelcontextprotocol/inspector node dist/index.js
```
