import { ensureAppRole } from '../app-role.ts';
import { readAppRolePassword } from '../env.ts';
import { runMigrations } from '../migrate.ts';
import { openPrivilegedDatabase } from '../privileged.ts';
import { APP_ROLE } from '../schema/tenant-policies.ts';

// Local development (`pnpm db:migrate`): the migrations, then the app role with the login the
// web connects with (APP_DATABASE_PASSWORD in .env), like the release step does in Railway.
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
} finally {
  await close();
}
