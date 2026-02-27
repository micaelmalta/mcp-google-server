/**
 * Converts Google API errors into actionable error messages for MCP tool responses.
 */
export function handleGoogleError(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();

    if (msg.includes('invalid_grant') || msg.includes('token has been expired') || msg.includes('token has been revoked')) {
      return 'Error: Authentication expired or revoked. Use google_auth_start to re-authenticate.';
    }
    if (msg.includes('not authenticated')) {
      return error.message;
    }
    if (msg.includes('insufficient permission') || msg.includes('forbidden') || msg.includes('403')) {
      return 'Error: Insufficient permissions. Ensure the requested scope was granted during OAuth authorization.';
    }
    if (msg.includes('not found') || msg.includes('404')) {
      return `Error: Resource not found. Check that the ID is correct. Details: ${error.message}`;
    }
    if (msg.includes('quota') || msg.includes('rate limit') || msg.includes('429')) {
      return 'Error: API quota or rate limit exceeded. Please wait before making more requests.';
    }
    if (msg.includes('invalid') && msg.includes('id')) {
      return `Error: Invalid resource ID format. Details: ${error.message}`;
    }
    return `Error: ${error.message}`;
  }
  return `Error: Unexpected error - ${String(error)}`;
}
