import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api';
import { describe, expect, it } from 'vitest';
import { migrationsFolder } from './migrate.ts';
import * as schema from './schema/index.ts';

type Snapshot = Parameters<typeof generateMigration>[0];

async function latestSnapshot(): Promise<Snapshot> {
  const files = (await readdir(join(migrationsFolder, 'meta')))
    .filter((file) => file.endsWith('_snapshot.json'))
    .sort();
  const latest = files.at(-1);
  if (!latest) {
    throw new Error('No migration snapshots found. Run `pnpm db:generate`.');
  }
  return JSON.parse(await readFile(join(migrationsFolder, 'meta', latest), 'utf8')) as Snapshot;
}

describe('E004 migrations', () => {
  it('match the schema (run `pnpm db:generate` after changing it)', async () => {
    const committed = await latestSnapshot();
    const current = generateDrizzleJson(schema, committed.id);

    expect(await generateMigration(committed, current)).toEqual([]);
  });
});
