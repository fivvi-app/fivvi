import { createCronDatabase } from '@fivvi/database';
import { createErrorReporter } from '@fivvi/observability';
import { isPreviewEnvironment, startMonitorCheckIn } from './monitor.ts';
import { createRegistry } from './registry.ts';
import { runCron } from './runner.ts';

// Entrypoint of the Railway cron service (docs/engineering/ENVIRONMENTS.md, ADR-027). Railway
// starts it on the schedule and expects it to exit: 0 when every task went well, 1 when the run
// or a task failed, after every task had its turn. The tasks use the cron role's connection
// (CRON_DATABASE_URL, E012): it can use only the tables the tasks declare, and it never prints
// that URL, which contains the password.
if (isPreviewEnvironment(process.env)) {
  console.log(
    `Cron skipped: ${process.env.RAILWAY_ENVIRONMENT_NAME} is a preview environment, which runs no schedule.`,
  );
  process.exit(0);
}

const started = performance.now();
// Reports a failure to Sentry when SENTRY_DSN is set (E009); off otherwise.
const errorReporter = createErrorReporter();
// The monitor learns that the run started, and how it ended (E012, AC10); production only.
const checkIn = startMonitorCheckIn(errorReporter, process.env);
const runId = crypto.randomUUID();
console.log(`Cron started: run ${runId}.`);
try {
  const { db, close } = createCronDatabase();
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
checkIn.finish(process.exitCode ? 'error' : 'ok');
// Send the reports before the process exits; flush gives up after a timeout.
await errorReporter.flush();
