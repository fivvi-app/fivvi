import { createDatabase, type DatabaseClient } from './client.ts';
import {
  openPrivilegedPool,
  PRIVILEGED_ALLOW_LIST,
  PRIVILEGED_USES,
  type PrivilegedOptions,
  type PrivilegedPool,
  type PrivilegedReason,
  privilegedConfig,
} from './privileged-access.ts';

// The gate to the privileged connection lives in `privileged-access.ts`, which loads no ORM, so
// the restore helper can start light (#1309). This file adds the connection with the ORM and
// re-exports the gate, so every importer keeps one place to ask.
export {
  openPrivilegedPool,
  PRIVILEGED_ALLOW_LIST,
  PRIVILEGED_USES,
  type PrivilegedOptions,
  type PrivilegedPool,
  type PrivilegedReason,
};

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
  return createDatabase(privilegedConfig(reason, options));
}
