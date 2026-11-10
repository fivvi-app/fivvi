import { normalizeEmail } from '../email.ts';
import type { ParsedImport, ParsedRow } from './parse.ts';

// The data-quality check of the import (E015, `import-checklist.md` §5): a pure function over the
// parsed rows and a read-only snapshot of the workspace. This ticket checks the `clients` sheet;
// the other sheets are added by the tickets that import them, and are not looked at yet.

/** What the check needs to know of the workspace, read once and never changed by the check. */
export interface WorkspaceSnapshot {
  /** The workspace name, for the message about an unknown trainer. */
  readonly name: string;
  /** The email addresses of the trainers of the workspace (the team members who train). */
  readonly trainerEmails: readonly string[];
  /** The clients the workspace already has: where a row's email address matches, the client is reused. */
  readonly clients: readonly { readonly id: string; readonly email: string }[];
}

export type ImportProblemType =
  | 'sheet-missing'
  | 'column-missing'
  | 'column-not-imported'
  | 'column-repeated'
  | 'column-without-name'
  | 'value-missing'
  | 'client-key-duplicate'
  | 'email-missing'
  | 'email-invalid'
  | 'email-duplicate'
  | 'language-not-supported'
  | 'trainer-unknown'
  | 'status-not-supported'
  | 'client-inactive'
  | 'client-exists';

/**
 * One finding. `row` is the row of the sheet (the header is row 1, and is where a problem of a
 * column is). An error blocks the import, a warning does not. `values` holds what the message
 * names, as text; it can hold a cell of the file, so it goes to the Owner who uploaded the file and
 * never to a log or an event (AC14): those get `sheet`, `row` and `type`.
 */
export interface ImportProblem {
  readonly severity: 'error' | 'warning';
  readonly type: ImportProblemType;
  readonly sheet: string;
  readonly row: number;
  readonly column?: string;
  readonly values: Readonly<Record<string, string>>;
}

export interface ImportCheck {
  readonly problems: readonly ImportProblem[];
  /** Whether the file has no error. Warnings don't block. */
  readonly canImport: boolean;
  /** The number of data rows of each checked sheet. */
  readonly sheets: Readonly<Record<string, { readonly rows: number }>>;
}

/** The columns of the `clients` sheet (`import-checklist.md` §3.2) and which of them every row needs. */
export const CLIENT_SHEET = {
  name: 'clients',
  required: ['client_key', 'first_name', 'email', 'status'],
  optional: ['last_name', 'language', 'default_location', 'trainer_email'],
  languages: ['nl', 'en'],
  statuses: ['active', 'inactive'],
} as const;

// The pattern of zod's `z.email()`, which the API checks a client's address with.
const EMAIL =
  /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;

/** Whether a row of the clients sheet is left out of the import: the status `inactive` (§3.2). */
export function isInactive(row: ParsedRow): boolean {
  return (row.cells.status ?? '').toLowerCase() === 'inactive';
}

/** Which rows of the clients sheet match the email of a client of the workspace, by row. */
export function existingClientsByRow(
  rows: readonly ParsedRow[],
  workspace: WorkspaceSnapshot,
): Map<number, { readonly id: string; readonly email: string }> {
  const byEmail = new Map(
    workspace.clients.map((client) => [normalizeEmail(client.email), client]),
  );
  const matches = new Map<number, { readonly id: string; readonly email: string }>();
  for (const row of rows) {
    const existing = byEmail.get(normalizeEmail(row.cells.email ?? ''));
    if (existing && (row.cells.email ?? '') !== '') matches.set(row.row, existing);
  }
  return matches;
}

function checkClients(parsed: ParsedImport, workspace: WorkspaceSnapshot): ImportProblem[] {
  const sheet = parsed[CLIENT_SHEET.name];
  const problems: ImportProblem[] = [];
  const add = (
    severity: ImportProblem['severity'],
    type: ImportProblemType,
    row: number,
    column: string | undefined,
    values: Record<string, string> = {},
  ) => {
    problems.push({
      severity,
      type,
      sheet: CLIENT_SHEET.name,
      row,
      ...(column === undefined ? {} : { column }),
      values,
    });
  };

  if (!sheet) {
    add('error', 'sheet-missing', 1, undefined, { sheet: CLIENT_SHEET.name });
    return problems;
  }

  const known: readonly string[] = [...CLIENT_SHEET.required, ...CLIENT_SHEET.optional];
  for (const column of sheet.columns) {
    if (!known.includes(column)) add('error', 'column-not-imported', 1, column, { column });
  }
  for (const column of sheet.repeatedColumns) {
    add('error', 'column-repeated', 1, column, { column });
  }
  for (const column of sheet.unnamedColumns) {
    add('warning', 'column-without-name', 1, column, { column });
  }
  const has = (column: string) => sheet.columns.includes(column);
  for (const column of CLIENT_SHEET.required) {
    if (!has(column)) add('error', 'column-missing', 1, column, { column });
  }

  const trainers = new Set(workspace.trainerEmails.map(normalizeEmail));
  const existing = existingClientsByRow(sheet.rows, workspace);
  const keys = new Map<string, number>();
  const emails = new Map<string, number>();

  for (const row of sheet.rows) {
    const cell = (column: string) => row.cells[column] ?? '';
    const where = String(row.row);

    for (const column of ['client_key', 'first_name', 'status'] as const) {
      if (has(column) && cell(column) === '') {
        add('error', 'value-missing', row.row, column, { row: where, column });
      }
    }

    const key = cell('client_key').toLowerCase();
    if (key !== '') {
      if (keys.has(key)) {
        add('error', 'client-key-duplicate', row.row, 'client_key', {
          row: where,
          value: cell('client_key'),
        });
      } else {
        keys.set(key, row.row);
      }
    }

    if (has('email')) {
      const email = normalizeEmail(cell('email'));
      if (email === '') {
        add('error', 'email-missing', row.row, 'email', { row: where });
      } else if (!EMAIL.test(email)) {
        add('error', 'email-invalid', row.row, 'email', { row: where });
      } else if (emails.has(email)) {
        add('error', 'email-duplicate', row.row, 'email', {
          row: where,
          firstRow: String(emails.get(email)),
        });
      } else {
        emails.set(email, row.row);
        if (existing.has(row.row)) {
          add('warning', 'client-exists', row.row, 'email', { row: where });
        }
      }
    }

    const language = cell('language').toLowerCase();
    if (language !== '' && !(CLIENT_SHEET.languages as readonly string[]).includes(language)) {
      add('error', 'language-not-supported', row.row, 'language', { row: where });
    }

    const trainer = normalizeEmail(cell('trainer_email'));
    if (trainer !== '' && !trainers.has(trainer)) {
      add('error', 'trainer-unknown', row.row, 'trainer_email', {
        row: where,
        email: trainer,
        workspace: workspace.name,
      });
    }

    const status = cell('status').toLowerCase();
    if (status !== '' && !(CLIENT_SHEET.statuses as readonly string[]).includes(status)) {
      add('error', 'status-not-supported', row.row, 'status', { row: where });
    } else if (status === 'inactive') {
      add('warning', 'client-inactive', row.row, 'status', { row: where });
    }
  }
  return problems;
}

/**
 * Checks the file against the rules of the sheets it holds (today `clients`): the required
 * columns, no column outside the template (AC12), a unique `client_key` and email address,
 * every client has a valid email address (`PRODUCT.md §34`), `language` and `status` from their
 * fixed values, and a `trainer_email` that is a trainer of the workspace. A client of the workspace
 * with the same email address is only a warning: it is reused (F006). `inactive` clients are a
 * warning too: they are left out (§3.2).
 */
export function checkImport(parsed: ParsedImport, workspace: WorkspaceSnapshot): ImportCheck {
  const problems = checkClients(parsed, workspace);
  return {
    problems,
    canImport: problems.every((problem) => problem.severity !== 'error'),
    sheets: { [CLIENT_SHEET.name]: { rows: parsed[CLIENT_SHEET.name]?.rows.length ?? 0 } },
  };
}
