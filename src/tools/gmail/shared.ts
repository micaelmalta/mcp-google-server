import { google } from 'googleapis';
import { requireAuth } from '../../auth/oauth.js';

export function getGmail() {
  const auth = requireAuth();
  return google.gmail({ version: 'v1', auth });
}

export interface FilterResult {
  id: string;
  criteria: { from?: string; to?: string; subject?: string; query?: string };
  action: { addLabelIds: string[]; removeLabelIds: string[] };
  [key: string]: unknown;
}

type RawFilter = {
  id?: string | null;
  criteria?: { from?: string | null; to?: string | null; subject?: string | null; query?: string | null } | null;
  action?: { addLabelIds?: string[] | null; removeLabelIds?: string[] | null } | null;
};

export function formatFilter(f: RawFilter): FilterResult {
  return {
    id: f.id ?? '',
    criteria: {
      ...(f.criteria?.from    ? { from:    f.criteria.from    } : {}),
      ...(f.criteria?.to      ? { to:      f.criteria.to      } : {}),
      ...(f.criteria?.subject ? { subject: f.criteria.subject } : {}),
      ...(f.criteria?.query   ? { query:   f.criteria.query   } : {}),
    },
    action: {
      addLabelIds:    f.action?.addLabelIds    ?? [],
      removeLabelIds: f.action?.removeLabelIds ?? [],
    },
  };
}

export function buildCriteria(args: { from?: string; to?: string; subject?: string; query?: string }) {
  const criteria: { from?: string; to?: string; subject?: string; query?: string } = {};
  if (args.from)    criteria.from    = args.from;
  if (args.to)      criteria.to      = args.to;
  if (args.subject) criteria.subject = args.subject;
  if (args.query)   criteria.query   = args.query;
  return criteria;
}

export function buildAction(args: {
  add_labels?: string;
  remove_labels?: string;
  skip_inbox?: boolean;
  mark_as_read?: boolean;
  mark_as_important?: boolean;
}) {
  const addLabelIds = [
    ...(args.add_labels ? args.add_labels.split(',').map((l) => l.trim()).filter(Boolean) : []),
    ...(args.mark_as_important ? ['IMPORTANT'] : []),
  ];
  const removeLabelIds = [
    ...(args.remove_labels ? args.remove_labels.split(',').map((l) => l.trim()).filter(Boolean) : []),
    ...(args.skip_inbox  ? ['INBOX']  : []),
    ...(args.mark_as_read ? ['UNREAD'] : []),
  ];
  return {
    addLabelIds:    [...new Set(addLabelIds)],
    removeLabelIds: [...new Set(removeLabelIds)],
  };
}
