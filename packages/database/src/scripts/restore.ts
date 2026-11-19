import { openPrivilegedPool } from '../privileged-access.ts';
import { runRestore } from '../restore-cli.ts';

// The database side of the restore drill (E016, `scripts/restore-drill.sh`): drill markers and
// per-table row counts. Each connection is named by the environment variable that holds its URL
// (`--database-url-env`), never passed as an argument. The privileged connection is for this step
// only, on the allow-list of privileged.ts for the reason `restore` (E011, AC17).
process.exitCode = await runRestore(process.argv.slice(2), {
  open: (variable) => openPrivilegedPool('restore', { variable }),
  out: (line) => console.log(line),
});
