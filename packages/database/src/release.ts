import type { Database } from './client.ts';
import { runMigrations } from './migrate.ts';
import { seed } from './seed.ts';

export interface ReleaseOptions {
  /** Also insert demo data. Previews only; production never seeds (E003). */
  seed: boolean;
  /** The `production` environment: even a requested seed creates nothing. */
  production?: boolean;
}

/**
 * The release step that runs once before each deploy (Railway pre-deploy command, E003):
 * apply pending migrations, forward-only, then seed if asked. The new deployment only
 * starts when this succeeds.
 */
export async function release(
  db: Database,
  options: ReleaseOptions,
  log: (message: string) => void = console.log,
): Promise<void> {
  await runMigrations(db);
  log('Migrations applied.');
  if (options.seed) {
    await seed(db, { production: options.production });
    log('Seed data inserted.');
  }
}
