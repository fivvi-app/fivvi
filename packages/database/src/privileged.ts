import { createDatabase, type DatabaseClient } from './client.ts';
import { PRIVILEGED_DATABASE_URL_VARIABLE, readDatabaseConfig } from './env.ts';

/**
 * The reasons for which code may use the privileged connection (the user of `DATABASE_URL`, who
 * owns the tables and bypasses nothing the app role is held to). The key is what a call passes
 * and what the log shows; the text is for the reader. Fixed words, so a reason can never carry
 * personal data. A new reason is a reviewed change to this list (E011, AC17).
 */
export const PRIVILEGED_USES = {
  release: 'the release step: migrations, the app role and the seed',
  'local-setup': 'local development setup: db:migrate and db:seed',
  restore:
    'the restore drill: drill markers and row counts of a source and a restored database (E016)',
} as const;

export type PrivilegedReason = keyof typeof PRIVILEGED_USES;

/**
 * The reviewed allow-list (AC17): the source files that may call `openPrivilegedDatabase`, each
 * for one reason. The unit test `AC17: privileged access only from the allow-list, with a
 * reason` fails for a call from another file, for another reason or without a literal reason,
 * and for any other source file that reads `DATABASE_URL`. A new entry is owner-reviewed:
 * `packages/database` is a high-risk path (`scripts/high-risk-paths.txt`).
 */
export const PRIVILEGED_ALLOW_LIST: Readonly<Record<string, PrivilegedReason>> = {
  'packages/database/src/scripts/release.ts': 'release',
  'packages/database/src/scripts/migrate.ts': 'local-setup',
  'packages/database/src/scripts/seed.ts': 'local-setup',
  'packages/database/src/scripts/restore.ts': 'restore',
};

export interface PrivilegedOptions {
  env?: NodeJS.ProcessEnv;
  /** Where the line naming the reason goes. */
  log?: (message: string) => void;
  maxConnections?: number;
  /**
   * The name of the environment variable that holds the connection, for the reason `restore`
   * only: the restore drill talks to two databases (the source and a restored copy), so it names
   * the variable of each. The URL itself never goes on a command line. Any other reason uses
   * `DATABASE_URL`.
   */
  variable?: string;
}

/** An upper-case name that is not the app role's or the cron role's variable (`APP_…`, `CRON_…`). */
const VARIABLE_NAME = /^(?!APP_|CRON_)[A-Z][A-Z0-9_]*$/;

/** The variable a call reads: its own for the reason `restore`, `DATABASE_URL` otherwise. */
function privilegedVariable(reason: PrivilegedReason, variable: string | undefined): string {
  if (variable === undefined) return PRIVILEGED_DATABASE_URL_VARIABLE;
  if (reason !== 'restore') {
    throw new Error('Only the reason restore may name the variable of the connection.');
  }
  if (!VARIABLE_NAME.test(variable)) {
    throw new Error('The variable of a restore connection must be an upper-case name of its own.');
  }
  return variable;
}

/**
 * The one way to get the privileged connection, `DATABASE_URL` (E011, ADR-006). It takes the
 * reason for which the caller needs it, logs that reason (never the connection, never personal
 * data), and is called only from the files on `PRIVILEGED_ALLOW_LIST`. The web runtime never
 * calls it: it connects as the app role (`createAppDatabaseFromEnv`).
 *
 * The reason `restore` may name another variable (`variable`), because the restore drill opens
 * the source and the restored database side by side.
 */
export function openPrivilegedDatabase(
  reason: PrivilegedReason,
  options: PrivilegedOptions = {},
): DatabaseClient {
  const { env = process.env, log = console.log, maxConnections, variable } = options;
  if (!Object.hasOwn(PRIVILEGED_USES, reason)) {
    throw new Error('Unknown privileged database reason.');
  }
  const config = readDatabaseConfig(env, privilegedVariable(reason, variable));
  log(`Privileged database access: ${reason} (${PRIVILEGED_USES[reason]}).`);
  return createDatabase({ ...config, maxConnections });
}
