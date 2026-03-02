import { google } from 'googleapis';
import { requireAuth } from '../../auth/oauth.js';

export function getSlides() {
  return google.slides({ version: 'v1', auth: requireAuth() });
}
