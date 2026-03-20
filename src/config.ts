import fs from 'fs';
import yaml from 'js-yaml';
import { SCOPES } from './constants.js';

export interface ServerConfig {
  readOnly?: boolean;
  enabledTools?: string[];
}

/**
 * Maps group names (used in config.yml) to the tool-name prefixes they cover.
 * A tool is in a group if its name starts with any of the listed prefixes.
 */
const GROUP_PREFIXES: Record<string, string[]> = {
  auth:      ['google_auth_'],
  calendar:  ['google_calendar_'],
  gmail:     ['google_gmail_'],
  drive:     ['google_drive_'],
  docs:      ['google_docs_'],
  sheets:    ['google_sheets_'],
  slides:    ['google_slides_'],
  directory: ['google_directory_', 'google_contacts_'],
};

/**
 * Static map of all tool names to their readOnlyHint annotation.
 * Derived from annotations in each tool file to avoid runtime introspection.
 */
const TOOL_READ_ONLY: Record<string, boolean> = {
  // auth
  google_auth_start:               false,
  google_auth_status:              true,
  google_auth_revoke:              false,
  // calendar
  google_calendar_list_calendars:  true,
  google_calendar_list_events:     true,
  google_calendar_get_event:       true,
  google_calendar_get_freebusy:    true,
  google_calendar_create_event:    false,
  google_calendar_update_event:    false,
  google_calendar_approve_event:   false,
  google_calendar_decline_event:   false,
  google_calendar_delete_event:    false,
  // gmail
  google_gmail_list_messages:      true,
  google_gmail_list_threads:       true,
  google_gmail_get_message:        true,
  google_gmail_get_thread:         true,
  google_gmail_list_labels:        true,
  google_gmail_list_drafts:        true,
  google_gmail_get_draft:          true,
  google_gmail_open_draft:         true,
  google_gmail_send_email:         false,
  google_gmail_reply_email:        false,
  google_gmail_modify_labels:      false,
  google_gmail_create_draft:       false,
  google_gmail_update_draft:       false,
  google_gmail_send_draft:         false,
  google_gmail_delete_draft:       false,
  // drive
  google_drive_list_files:         true,
  google_drive_search_files:       true,
  google_drive_get_file:           true,
  google_drive_list_permissions:   true,
  google_drive_create_folder:      false,
  google_drive_move_file:          false,
  google_drive_delete_file:        false,
  google_drive_share_file:         false,
  // docs
  google_docs_get:                 true,
  google_docs_create:              false,
  google_docs_append_text:         false,
  // sheets
  google_sheets_get_values:        true,
  google_sheets_create:            false,
  google_sheets_update_values:     false,
  google_sheets_append_values:     false,
  google_sheets_add_sheet:         false,
  google_sheets_delete_sheet:      false,
  // slides
  google_slides_get:               true,
  google_slides_create:            false,
  google_slides_append_slides:     false,
  // directory
  google_directory_list:           true,
  google_directory_search:         true,
  google_contacts_list:            true,
  google_contacts_search:          true,
};

/**
 * Read-only OAuth scopes — narrower versions of the full SCOPES constant.
 * Used when readOnly: true is set in config.
 */
export const READ_ONLY_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/documents.readonly',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/presentations.readonly',
  'https://www.googleapis.com/auth/contacts.readonly',
  'https://www.googleapis.com/auth/directory.readonly',
];

/**
 * Loads config from a YAML file. Returns { readOnly: true } if the file doesn't exist.
 */
export function loadConfig(configPath?: string): ServerConfig {
  const filePath = configPath ?? process.env.CONFIG_PATH ?? 'config.yml';
  if (!fs.existsSync(filePath)) return { readOnly: true };
  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = yaml.load(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { readOnly: true };
  const obj = parsed as Record<string, unknown>;
  return {
    ...(typeof obj.readOnly === 'boolean' ? { readOnly: obj.readOnly } : {}),
    ...(Array.isArray(obj.enabledTools)
      ? { enabledTools: obj.enabledTools.filter((t): t is string => typeof t === 'string') }
      : {}),
  };
}

/**
 * Returns true if the given tool should be registered based on the config.
 * Both readOnly and enabledTools filters must pass (if set).
 */
export function shouldRegisterTool(toolName: string, config: ServerConfig): boolean {
  // readOnly filter: skip tools that are not read-only
  if (config.readOnly) {
    const isReadOnly = TOOL_READ_ONLY[toolName];
    if (!isReadOnly) return false;
  }

  // enabledTools filter: skip tools not in the allowlist
  if (config.enabledTools && config.enabledTools.length > 0) {
    const allowed = config.enabledTools.some((entry) => {
      // Exact tool name match
      if (entry === toolName) return true;
      // Group name match — check all prefixes for this group
      const prefixes = GROUP_PREFIXES[entry];
      if (prefixes) return prefixes.some((p) => toolName.startsWith(p));
      return false;
    });
    if (!allowed) return false;
  }

  return true;
}

/**
 * Returns the OAuth scopes to advertise and request.
 * Uses read-only scopes when readOnly: true, full scopes otherwise.
 */
export function getScopesForConfig(config: ServerConfig): string[] {
  return config.readOnly ? READ_ONLY_SCOPES : SCOPES;
}
