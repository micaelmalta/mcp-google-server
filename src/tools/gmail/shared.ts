import { google } from 'googleapis';
import { requireAuth } from '../../auth/oauth.js';

export function getGmail() {
  const auth = requireAuth();
  return google.gmail({ version: 'v1', auth });
}
