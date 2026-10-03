import { createDatabaseFromEnv } from '@trainer-hub/database';
import { runDailyJobs } from './daily.ts';

// Entrypoint of the Railway cron service (docs/engineering/ENVIRONMENTS.md). Railway starts
// it on the schedule and expects it to exit: 0 on success, 1 on failure. It never prints
// DATABASE_URL, which contains the password.
const started = performance.now();
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
  process.exitCode = 1;
}
