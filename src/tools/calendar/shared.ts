import { google } from 'googleapis';
import { requireAuth } from '../../auth/oauth.js';

export function getCalendar() {
  const auth = requireAuth();
  return google.calendar({ version: 'v3', auth });
}
