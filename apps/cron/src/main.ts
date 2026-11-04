import { openPrivilegedDatabase } from '@fivvi/database';
import { createErrorReporter } from '@fivvi/observability';
import { createRegistry } from './registry.ts';
import { runCron } from './runner.ts';

// Entrypoint of the Railway cron service (docs/engineering/ENVIRONMENTS.md, ADR-027). Railway
// starts it on the schedule and expects it to exit: 0 when every task went well, 1 when the run
// or a task failed, after every task had its turn. It never prints DATABASE_URL, which contains
// the password. The tasks reach every workspace, so they use the privileged connection through its
// one path, on the allow-list with a reason (E011, AC17).
const started = performance.now();
// Reports a failure to Sentry when SENTRY_DSN is set (E009); off otherwise.
const errorReporter = createErrorReporter();
const runId = crypto.randomUUID();
console.log(`Cron started: run ${runId}.`);
try {
  const { db, close } = openPrivilegedDatabase('daily-cron');
  try {
    const result = await runCron({
      db,
      tasks: createRegistry(process.env),
      runId,
      log: (message) => console.log(message),
      errorReporter,
    });
    if (result.failed) process.exitCode = 1;
  } finally {
    await close();
  }
  console.log(`Cron finished in ${Math.round(performance.now() - started)} ms.`);
} catch (error) {
  console.error('Cron failed:', (error as Error).message);
  errorReporter.captureError(error, { tags: { 'cron.run_id': runId } });
  process.exitCode = 1;
}
// Send the reports before the process exits; flush gives up after a timeout.
await errorReporter.flush();
