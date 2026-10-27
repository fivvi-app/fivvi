import { ensureAppRole } from './app-role.ts';
import type { Database } from './client.ts';
import { APP_ROLE_PASSWORD_VARIABLE } from './env.ts';
import { runMigrations } from './migrate.ts';
import { APP_ROLE } from './schema/tenant-policies.ts';
import { seed } from './seed.ts';

export interface ReleaseOptions {
  /** Also insert demo data. Previews only; production never seeds (E003). */
  seed: boolean;
  /** The `production` environment: even a requested seed creates nothing. */
  production?: boolean;
  /**
   * The environment's secret for the app role (`APP_DATABASE_PASSWORD`, E011). Unset: the release
   * step still succeeds and leaves the role's login and password as they are, so a preview
   * deploys before the owner has set the secret.
   */
  appRolePassword?: string;
}

/**
 * The release step that runs once before each deploy (Railway pre-deploy command, E003):
 * apply pending migrations, forward-only (which also resets the app role's table privileges),
 * create or update the app role with its password, then seed if asked. The new deployment only
 * starts when this succeeds.
 */
export async function release(
  db: Database,
  options: ReleaseOptions,
  log: (message: string) => void = console.log,
): Promise<void> {
  await runMigrations(db);
  log('Migrations applied.');
  const role = await ensureAppRole(db, { password: options.appRolePassword });
  log(
    role.passwordSet
      ? `App role ${APP_ROLE}: login enabled, password set from ${APP_ROLE_PASSWORD_VARIABLE}.`
      : `App role ${APP_ROLE}: ${APP_ROLE_PASSWORD_VARIABLE} is not set, so its login and password are left as they are${role.login ? '' : ' (it cannot log in yet)'}.`,
  );
  if (options.seed) {
    await seed(db, { production: options.production });
    log('Seed data inserted.');
  }
}
