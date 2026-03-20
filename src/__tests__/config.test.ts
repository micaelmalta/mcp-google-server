import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'fs';
import { loadConfig, shouldRegisterTool, getScopesForConfig, READ_ONLY_SCOPES } from '../config.js';
import { SCOPES } from '../constants.js';

vi.mock('fs');

const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockExistsSync = vi.mocked(fs.existsSync);

afterEach(() => {
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// loadConfig
// ---------------------------------------------------------------------------

describe('loadConfig', () => {
  it('returns { readOnly: true } when config file does not exist', () => {
    mockExistsSync.mockReturnValue(false);
    expect(loadConfig('/some/path/config.yml')).toEqual({ readOnly: true });
  });

  it('returns { readOnly: true } when file contents are not an object', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('null');
    expect(loadConfig('/path/config.yml')).toEqual({ readOnly: true });
  });

  it('parses readOnly: true', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('readOnly: true\n');
    expect(loadConfig('/path/config.yml')).toEqual({ readOnly: true });
  });

  it('parses enabledTools list', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      'enabledTools:\n  - calendar\n  - google_drive_list_files\n'
    );
    expect(loadConfig('/path/config.yml')).toEqual({
      enabledTools: ['calendar', 'google_drive_list_files'],
    });
  });

  it('parses both readOnly and enabledTools', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('readOnly: true\nenabledTools:\n  - gmail\n');
    expect(loadConfig('/path/config.yml')).toEqual({
      readOnly: true,
      enabledTools: ['gmail'],
    });
  });
});

// ---------------------------------------------------------------------------
// shouldRegisterTool — no config (all tools pass)
// ---------------------------------------------------------------------------

describe('shouldRegisterTool — empty config', () => {
  it('allows any tool when config is empty', () => {
    expect(shouldRegisterTool('google_calendar_create_event', {})).toBe(true);
    expect(shouldRegisterTool('google_gmail_send_email', {})).toBe(true);
    expect(shouldRegisterTool('google_drive_delete_file', {})).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// shouldRegisterTool — readOnly filter
// ---------------------------------------------------------------------------

describe('shouldRegisterTool — readOnly: true', () => {
  const config = { readOnly: true };

  it('allows read-only tools', () => {
    expect(shouldRegisterTool('google_calendar_list_events', config)).toBe(true);
    expect(shouldRegisterTool('google_calendar_get_event', config)).toBe(true);
    expect(shouldRegisterTool('google_calendar_get_freebusy', config)).toBe(true);
    expect(shouldRegisterTool('google_gmail_list_messages', config)).toBe(true);
    expect(shouldRegisterTool('google_gmail_get_message', config)).toBe(true);
    expect(shouldRegisterTool('google_drive_list_files', config)).toBe(true);
    expect(shouldRegisterTool('google_drive_search_files', config)).toBe(true);
    expect(shouldRegisterTool('google_docs_get', config)).toBe(true);
    expect(shouldRegisterTool('google_sheets_get_values', config)).toBe(true);
    expect(shouldRegisterTool('google_slides_get', config)).toBe(true);
    expect(shouldRegisterTool('google_directory_list', config)).toBe(true);
    expect(shouldRegisterTool('google_auth_status', config)).toBe(true);
  });

  it('blocks write tools', () => {
    expect(shouldRegisterTool('google_calendar_create_event', config)).toBe(false);
    expect(shouldRegisterTool('google_calendar_delete_event', config)).toBe(false);
    expect(shouldRegisterTool('google_gmail_send_email', config)).toBe(false);
    expect(shouldRegisterTool('google_gmail_reply_email', config)).toBe(false);
    expect(shouldRegisterTool('google_drive_delete_file', config)).toBe(false);
    expect(shouldRegisterTool('google_drive_share_file', config)).toBe(false);
    expect(shouldRegisterTool('google_docs_create', config)).toBe(false);
    expect(shouldRegisterTool('google_sheets_create', config)).toBe(false);
    expect(shouldRegisterTool('google_slides_create', config)).toBe(false);
    expect(shouldRegisterTool('google_auth_start', config)).toBe(false);
    expect(shouldRegisterTool('google_auth_revoke', config)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// shouldRegisterTool — enabledTools group filter
// ---------------------------------------------------------------------------

describe('shouldRegisterTool — enabledTools group filter', () => {
  it('allows tools matching a group name', () => {
    const config = { enabledTools: ['calendar'] };
    expect(shouldRegisterTool('google_calendar_list_events', config)).toBe(true);
    expect(shouldRegisterTool('google_calendar_create_event', config)).toBe(true);
    expect(shouldRegisterTool('google_calendar_delete_event', config)).toBe(true);
  });

  it('blocks tools not in the group', () => {
    const config = { enabledTools: ['calendar'] };
    expect(shouldRegisterTool('google_gmail_list_messages', config)).toBe(false);
    expect(shouldRegisterTool('google_drive_list_files', config)).toBe(false);
  });

  it('allows exact tool name match', () => {
    const config = { enabledTools: ['google_drive_list_files', 'google_drive_search_files'] };
    expect(shouldRegisterTool('google_drive_list_files', config)).toBe(true);
    expect(shouldRegisterTool('google_drive_search_files', config)).toBe(true);
    expect(shouldRegisterTool('google_drive_get_file', config)).toBe(false);
    expect(shouldRegisterTool('google_drive_delete_file', config)).toBe(false);
  });

  it('handles directory group covering both prefixes', () => {
    const config = { enabledTools: ['directory'] };
    expect(shouldRegisterTool('google_directory_list', config)).toBe(true);
    expect(shouldRegisterTool('google_directory_search', config)).toBe(true);
    expect(shouldRegisterTool('google_contacts_list', config)).toBe(true);
    expect(shouldRegisterTool('google_contacts_search', config)).toBe(true);
    expect(shouldRegisterTool('google_calendar_list_events', config)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// shouldRegisterTool — combined readOnly + enabledTools
// ---------------------------------------------------------------------------

describe('shouldRegisterTool — readOnly + enabledTools stacked', () => {
  it('requires both filters to pass', () => {
    const config = { readOnly: true, enabledTools: ['calendar'] };
    // read-only calendar tools pass both
    expect(shouldRegisterTool('google_calendar_list_events', config)).toBe(true);
    expect(shouldRegisterTool('google_calendar_get_event', config)).toBe(true);
    // write calendar tools fail readOnly
    expect(shouldRegisterTool('google_calendar_create_event', config)).toBe(false);
    expect(shouldRegisterTool('google_calendar_delete_event', config)).toBe(false);
    // read-only gmail tools fail enabledTools
    expect(shouldRegisterTool('google_gmail_list_messages', config)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getScopesForConfig
// ---------------------------------------------------------------------------

describe('getScopesForConfig', () => {
  it('returns full SCOPES when readOnly is not set', () => {
    expect(getScopesForConfig({})).toEqual(SCOPES);
    expect(getScopesForConfig({ enabledTools: ['calendar'] })).toEqual(SCOPES);
  });

  it('returns READ_ONLY_SCOPES when readOnly: true', () => {
    expect(getScopesForConfig({ readOnly: true })).toEqual(READ_ONLY_SCOPES);
  });

  it('READ_ONLY_SCOPES uses .readonly variants', () => {
    for (const scope of READ_ONLY_SCOPES) {
      expect(scope).toMatch(/\.readonly$/);
    }
  });

  it('READ_ONLY_SCOPES does not include write-only scopes like gmail.send', () => {
    const hasWriteScope = READ_ONLY_SCOPES.some(
      (s) => s.includes('gmail.send') || s.includes('gmail.modify') || s === 'https://www.googleapis.com/auth/drive'
    );
    expect(hasWriteScope).toBe(false);
  });
});
