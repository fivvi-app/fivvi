import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestDatabase } from '@fivvi/testing/database';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { describe, expect, it } from 'vitest';
import { createDatabase } from '../src/index.ts';
import { migrationsFolder, runMigrations } from '../src/migrate.ts';

// F068 (#739), AC2: the workspaces that exist before the word column read `trainer` after the
// migration, so nobody has to do anything. Synthetic rows only.

describe('F068 AC2 the backfill', () => {
  it('gives every workspace that exists before the word the word trainer', async () => {
    const tag = '0029_workspace_trainer_word';
    const journal = JSON.parse(
      await readFile(join(migrationsFolder, 'meta', '_journal.json'), 'utf8'),
    ) as { entries: { tag: string }[] };
    const index = journal.entries.findIndex((entry) => entry.tag === tag);
    expect(index).toBeGreaterThanOrEqual(0);

    const previous = await mkdtemp(join(tmpdir(), 'fivvi-migrations-'));
    const database = await createTestDatabase();
    const client = createDatabase({ url: database.url, maxConnections: 2 });
    try {
      await cp(migrationsFolder, previous, { recursive: true });
      // The journal cut just before the word: the workspaces have none yet.
      await writeFile(
        join(previous, 'meta', '_journal.json'),
        JSON.stringify({ ...journal, entries: journal.entries.slice(0, index) }),
      );
      await migrate(client.db, { migrationsFolder: previous });
      await client.db.execute(
        sql`insert into organizations (name, slug, default_locale, time_zone)
            select 'Older ' || n, 'older-' || n, 'nl-NL', 'Europe/Amsterdam'
            from generate_series(1, 5) as n`,
      );

      await runMigrations(client.db);

      const stored = (await client.db.execute(sql`select trainer_word from organizations`))
        .rows as { trainer_word: string }[];
      expect(stored).toHaveLength(5);
      expect(new Set(stored.map((row) => row.trainer_word))).toEqual(new Set(['trainer']));
    } finally {
      await client.close();
      await database.drop();
      await rm(previous, { recursive: true, force: true });
    }
  });
});
