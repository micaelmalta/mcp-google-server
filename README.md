# Google Workspace MCP Server

An MCP (Model Context Protocol) server that connects Claude to your Google Workspace using OAuth2. Supports Calendar, Gmail, Drive, Docs, Sheets, and Slides.

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
6. Add Authorized redirect URI: `http://localhost:8080/callback`
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
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://mail.google.com/`
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

### 4. Configure Claude

#### Claude CLI

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

To verify it was added:

```bash
claude mcp list
```

#### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

From GitHub (no local clone):

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

From local install:

```json
{
  "mcpServers": {
    "google-workspace": {
      "command": "node",
      "args": ["/path/to/mcp-google-server/dist/index.js"],
      "env": {
        "GOOGLE_CLIENT_ID": "your_client_id_here",
        "GOOGLE_CLIENT_SECRET": "your_client_secret_here"
      }
    }
  }
}
```

### 5. Authorize

In Claude, run: **"Use the google_auth_start tool"**

Open the URL it returns, sign in with Google, and grant permissions. Tokens are saved to `~/.google-mcp-tokens.json`.

---

## Available Tools

### Authentication

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

## HTTP Mode

HTTP mode is designed for **server deployments** (e.g. Kubernetes) where the server is shared across users and must be stateless. Each request supplies its own Google OAuth token JSON via the `X-Google-Tokens` header — no tokens are stored on disk.

> **For local development with Claude Desktop or Cursor, use stdio mode (the default).** It handles auth automatically via `google_auth_start` and stores tokens locally. HTTP mode is only needed when deploying the server to a shared environment.

### Starting the server

```bash
TRANSPORT=http \
PORT=3000 \
GOOGLE_CLIENT_ID=your_client_id \
GOOGLE_CLIENT_SECRET=your_client_secret \
node dist/index.js
```

The server exposes:
- `GET /health` — liveness/readiness probe, returns `{"status":"ok"}`
- `POST /mcp` — MCP endpoint, requires `X-Google-Tokens` header

### Obtaining tokens

Tokens must be obtained out-of-band (e.g. via a separate OAuth flow in your application) and passed per-request. The token JSON must contain at least an `access_token` or `refresh_token`.

If you need a quick token for testing, you can reuse the tokens saved by stdio mode:

```bash
cat ~/.google-mcp-tokens.json
```

### Making a request

```bash
TOKEN=$(cat ~/.google-mcp-tokens.json)

curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "X-Google-Tokens: $TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

### Token refresh

If the access token expires mid-request, `google-auth-library` refreshes it transparently. The updated token JSON is returned in an `X-Google-Tokens-Refreshed` response header — callers should store it and use it for subsequent requests to avoid redundant refreshes.

### Auth tools

`google_auth_start`, `google_auth_status`, and `google_auth_revoke` are not available in HTTP mode — they are only meaningful in stdio mode where tokens are managed locally.

---

## Environment Variables

| Variable               | Required | Default                          | Description                                      |
| ---------------------- | -------- | -------------------------------- | ------------------------------------------------ |
| `GOOGLE_CLIENT_ID`     | Yes      | —                                | OAuth2 Client ID from Google Cloud Console       |
| `GOOGLE_CLIENT_SECRET` | Yes      | —                                | OAuth2 Client Secret                             |
| `GOOGLE_REDIRECT_URI`  | No       | `http://localhost:8080/callback` | Must match Google Cloud Console (stdio mode only)|
| `GOOGLE_TOKENS_PATH`   | No       | `~/.google-mcp-tokens.json`      | Where to store OAuth tokens (stdio mode only)    |
| `TRANSPORT`            | No       | `stdio`                          | Set to `http` to run as an HTTP server           |
| `PORT`                 | No       | `3000`                           | HTTP server port (HTTP mode only)                |

---

## Token Storage

OAuth tokens are saved to `~/.google-mcp-tokens.json` with `chmod 600` permissions. The file contains both access and refresh tokens. The access token auto-refreshes — you only need to re-authorize if:

- You run `google_auth_revoke`
- The refresh token expires (6 months of inactivity)
- You revoke access from [Google Account Security](https://myaccount.google.com/permissions)

---

## Development

```bash
# Run in development mode with auto-reload
npm run dev

# Build TypeScript
npm run build

# Test with MCP Inspector
npx @modelcontextprotocol/inspector node dist/index.js
```
