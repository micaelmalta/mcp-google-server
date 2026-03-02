import { describe, it, expect } from 'vitest';
import { handleGoogleError } from '../errors.js';

describe('handleGoogleError', () => {
  it('returns re-auth message for invalid_grant', () => {
    const result = handleGoogleError(new Error('invalid_grant'));
    expect(result).toContain('Authentication expired or revoked');
    expect(result).toContain('google_auth_start');
  });

  it('returns re-auth message for token expired', () => {
    expect(handleGoogleError(new Error('token has been expired'))).toContain('google_auth_start');
    expect(handleGoogleError(new Error('token has been revoked'))).toContain('google_auth_start');
  });

  it('returns message as-is for not authenticated', () => {
    const msg = 'Not authenticated';
    expect(handleGoogleError(new Error(msg))).toBe(msg);
  });

  it('returns insufficient permissions for 403/forbidden', () => {
    expect(handleGoogleError(new Error('Insufficient permission'))).toContain('Insufficient permissions');
    expect(handleGoogleError(new Error('Forbidden'))).toContain('Insufficient permissions');
    expect(handleGoogleError(new Error('403'))).toContain('Insufficient permissions');
  });

  it('returns not found message for 404', () => {
    const result = handleGoogleError(new Error('not found'));
    expect(result).toContain('Resource not found');
    expect(result).toContain('not found');
  });

  it('returns quota message for rate limit', () => {
    expect(handleGoogleError(new Error('quota exceeded'))).toContain('quota');
    expect(handleGoogleError(new Error('rate limit'))).toContain('quota');
    expect(handleGoogleError(new Error('429'))).toContain('quota');
  });

  it('returns invalid ID message when error contains invalid and id', () => {
    const result = handleGoogleError(new Error('invalid id format'));
    expect(result).toContain('Invalid resource ID');
  });

  it('returns generic Error prefix for other Error', () => {
    expect(handleGoogleError(new Error('Something broke'))).toBe('Error: Something broke');
  });

  it('handles non-Error thrown values', () => {
    expect(handleGoogleError('string throw')).toContain('Unexpected error');
    expect(handleGoogleError(123)).toContain('123');
  });
});
