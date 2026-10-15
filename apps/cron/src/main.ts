import { createDatabaseFromEnv } from '@trainer-hub/database';
import { createErrorReporter } from '@trainer-hub/observability';
import { runDailyJobs } from './daily.ts';

// Entrypoint of the Railway cron service (docs/engineering/ENVIRONMENTS.md). Railway starts
// it on the schedule and expects it to exit: 0 on success, 1 on failure. It never prints
// DATABASE_URL, which contains the password.
const started = performance.now();
// Reports a failure to Sentry when SENTRY_DSN is set (E009); off otherwise.
const errorReporter = createErrorReporter();
console.log('Daily cron started.');
try {
  const { db, close } = createDatabaseFromEnv();
  try {
    await runDailyJobs({ db, log: (message) => console.log(message) });
  } finally {
    await close();
  }
  console.log(`Daily cron finished in ${Math.round(performance.now() - started)} ms.`);
} catch (error) {
  console.error('Daily cron failed:', (error as Error).message);
  errorReporter.captureError(error);
  // Send the report before the process exits; flush gives up after a timeout.
  await errorReporter.flush();
  process.exitCode = 1;
}
