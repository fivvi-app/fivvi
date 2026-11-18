import { ensureAppRole } from '../app-role.ts';
import { CRON_ROLE, ensureCronRole } from '../cron-role.ts';
import { readAppRolePassword, readCronRolePassword } from '../env.ts';
import { describeLibrarySync, syncExerciseLibrary } from '../library/sync.ts';
import { runMigrations } from '../migrate.ts';
import { openPrivilegedDatabase } from '../privileged.ts';
import { APP_ROLE } from '../schema/tenant-policies.ts';

// Local development (`pnpm db:migrate`): the migrations, then the app role with the login the
// web connects with (APP_DATABASE_PASSWORD in .env) and the cron role (CRON_DATABASE_PASSWORD),
// then the exercise library, like the release step does in Railway.
const { db, close } = openPrivilegedDatabase('local-setup');
try {
  await runMigrations(db);
  console.log('Migrations applied.');
  const role = await ensureAppRole(db, { password: readAppRolePassword() });
  console.log(
    role.passwordSet
      ? `App role ${APP_ROLE}: login enabled, password set from APP_DATABASE_PASSWORD.`
      : `App role ${APP_ROLE}: APP_DATABASE_PASSWORD is not set, so the web cannot connect as it. Copy packages/database/.env.example to .env.`,
  );
  const cron = await ensureCronRole(db, { password: readCronRolePassword() });
  console.log(
    cron.passwordSet
      ? `Cron role ${CRON_ROLE}: login enabled, password set from CRON_DATABASE_PASSWORD.`
      : `Cron role ${CRON_ROLE}: CRON_DATABASE_PASSWORD is not set, so the cron cannot connect as it. Copy packages/database/.env.example to .env.`,
  );
  console.log(describeLibrarySync(await syncExerciseLibrary(db)));
} finally {
  await close();
}
