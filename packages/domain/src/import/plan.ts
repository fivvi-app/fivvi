import { normalizeEmail } from '../email.ts';
import {
  CLIENT_SHEET,
  checkImport,
  existingClientsByRow,
  isInactive,
  type WorkspaceSnapshot,
} from './check.ts';
import type { ParsedImport } from './parse.ts';

/** A client the import would make, or find in the workspace: only the template's columns, nothing else. */
export interface PlannedClient {
  /** The row of the clients sheet. */
  readonly row: number;
  readonly sourceKey: string;
  readonly firstName: string;
  readonly lastName: string;
  /** Lower case. */
  readonly email: string;
  /** The language for emails: `nl` unless the row says `en`. */
  readonly language: 'nl' | 'en';
  readonly trainerEmail: string | null;
  /** `reuse`: the workspace has a client with this email address (F006), and no second one is made. */
  readonly action: 'create' | 'reuse';
  readonly existingClientId: string | null;
}

export interface ImportPlan {
  /** Counts per kind. `clients` is what the import adds or reuses: `clientsToCreate` + `clientsReused`. */
  readonly counts: {
    readonly clients: number;
    readonly clientsToCreate: number;
    readonly clientsReused: number;
    /** Inactive clients, left out. */
    readonly clientsSkipped: number;
  };
  readonly clients: readonly PlannedClient[];
}

/**
 * What the import would do with the file: which clients it adds, which it reuses (the email address
 * of a client of the workspace) and which it leaves out (`inactive`). A row with an error is not in
 * the plan: the check has to pass before an import. The plan holds the template's columns only, so a
 * column outside the template never gets this far (AC12).
 */
export function planImport(parsed: ParsedImport, workspace: WorkspaceSnapshot): ImportPlan {
  const sheet = parsed[CLIENT_SHEET.name];
  const rows = sheet?.rows ?? [];
  const withError = new Set(
    checkImport(parsed, workspace)
      .problems.filter((problem) => problem.severity === 'error' && problem.sheet === 'clients')
      .map((problem) => problem.row),
  );
  const existing = existingClientsByRow(rows, workspace);
  const planned: PlannedClient[] = [];
  let skipped = 0;

  for (const row of rows) {
    if (withError.has(row.row)) continue;
    if (isInactive(row)) {
      skipped++;
      continue;
    }
    const match = existing.get(row.row);
    planned.push({
      row: row.row,
      sourceKey: row.cells.client_key ?? '',
      firstName: row.cells.first_name ?? '',
      lastName: row.cells.last_name ?? '',
      email: normalizeEmail(row.cells.email ?? ''),
      language: (row.cells.language ?? '').toLowerCase() === 'en' ? 'en' : 'nl',
      trainerEmail: normalizeEmail(row.cells.trainer_email ?? '') || null,
      action: match ? 'reuse' : 'create',
      existingClientId: match?.id ?? null,
    });
  }
  const reused = planned.filter((client) => client.action === 'reuse').length;
  return {
    counts: {
      clients: planned.length,
      clientsToCreate: planned.length - reused,
      clientsReused: reused,
      clientsSkipped: skipped,
    },
    clients: planned,
  };
}
