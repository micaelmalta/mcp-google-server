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
   - `https://mail.google.com/`
   - `https://www.googleapis.com/auth/drive`
   - `https://www.googleapis.com/auth/documents`
   - `https://www.googleapis.com/auth/spreadsheets`
   - `https://www.googleapis.com/auth/presentations`

### 3. Install and Build

```bash
npm install
npm run build
```

### 4. Configure Claude

#### Claude CLI

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
| Tool | Description |
|------|-------------|
| `google_auth_start` | Start OAuth2 flow — returns authorization URL |
| `google_auth_status` | Check if authenticated and token details |
| `google_auth_revoke` | Delete stored tokens (re-auth required after) |

### Google Calendar
| Tool | Description |
|------|-------------|
| `google_calendar_list_calendars` | List all your calendars |
| `google_calendar_list_events` | List events with date/search filters |
| `google_calendar_get_event` | Get full event details |
| `google_calendar_create_event` | Create a new event with attendees |
| `google_calendar_update_event` | Update event title, time, attendees |
| `google_calendar_delete_event` | Delete an event |
| `google_calendar_get_freebusy` | Check free/busy for scheduling |

### Gmail
| Tool | Description |
|------|-------------|
| `google_gmail_list_messages` | Search and list messages |
| `google_gmail_get_message` | Read full message content |
| `google_gmail_send_email` | Send an email |
| `google_gmail_reply_email` | Reply to an existing thread |
| `google_gmail_list_threads` | List conversation threads |
| `google_gmail_get_thread` | Read full conversation thread |
| `google_gmail_modify_labels` | Add/remove labels (archive, star, mark read) |
| `google_gmail_list_labels` | List all labels with IDs |

### Google Drive
| Tool | Description |
|------|-------------|
| `google_drive_list_files` | List files in a folder |
| `google_drive_search_files` | Search with Drive query syntax |
| `google_drive_get_file` | Get file metadata |
| `google_drive_create_folder` | Create a new folder |
| `google_drive_move_file` | Move file to a different folder |
| `google_drive_delete_file` | Move file to Trash |
| `google_drive_share_file` | Share with user/group/anyone |
| `google_drive_list_permissions` | List file sharing permissions |

### Google Docs
| Tool | Description |
|------|-------------|
| `google_docs_create` | Create a new document |
| `google_docs_get` | Read document content |
| `google_docs_append_text` | Append text to document |

### Google Sheets
| Tool | Description |
|------|-------------|
| `google_sheets_create` | Create a new spreadsheet |
| `google_sheets_get_values` | Read cell values (A1 notation) |
| `google_sheets_update_values` | Write/overwrite cell values |
| `google_sheets_append_values` | Append new rows |

### Google Slides
| Tool | Description |
|------|-------------|
| `google_slides_create` | Create a new presentation |
| `google_slides_get` | Get slides and their text content |

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GOOGLE_CLIENT_ID` | Yes | — | OAuth2 Client ID from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | Yes | — | OAuth2 Client Secret |
| `GOOGLE_REDIRECT_URI` | No | `http://localhost:8080/callback` | Must match Google Cloud Console |
| `GOOGLE_TOKENS_PATH` | No | `~/.google-mcp-tokens.json` | Where to store OAuth tokens |

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
