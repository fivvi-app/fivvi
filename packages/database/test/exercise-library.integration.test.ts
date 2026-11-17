import { messages } from '@fivvi/i18n';
import { createTestDatabase } from '@fivvi/testing/database';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseClient } from '../src/index.ts';
import { type LibraryExercise, libraryMessageKey } from '../src/library/content.ts';
import { EXERCISE_LIBRARY } from '../src/library/exercises.ts';
import { syncExerciseLibrary } from '../src/library/sync.ts';
import { runMigrations } from '../src/migrate.ts';
import { release } from '../src/release.ts';

async function withFreshDatabase(test: (client: DatabaseClient) => Promise<void>): Promise<void> {
  const database = await createTestDatabase();
  const client = createDatabase({ url: database.url, maxConnections: 2 });
  try {
    await test(client);
  } finally {
    await client.close();
    await database.drop();
  }
}

interface Row {
  id: string;
  key: string;
  type: string;
  muscle_groups: string[];
  aliases: string[];
  retired: boolean;
  updated_at: Date;
}

async function table(client: DatabaseClient): Promise<Row[]> {
  const result = await client.db.execute(
    sql`select id, key, type, muscle_groups, aliases, retired, updated_at from exercise_library order by key`,
  );
  return result.rows as unknown as Row[];
}

const find = (rows: Row[], key: string): Row => {
  const row = rows.find((candidate) => candidate.key === key);
  if (!row) throw new Error(`no row for ${key}`);
  return row;
};

const options = { seed: false };

describe('F039 the release step syncs the exercise library', () => {
  it('fills a fresh database with the whole starting library, retired ones marked', async () => {
    await withFreshDatabase(async (client) => {
      const logs: string[] = [];
      await release(client.db, options, (message) => logs.push(message));

      const rows = await table(client);
      expect(rows).toHaveLength(122);
      expect(rows.map((row) => row.key).sort()).toEqual(
        EXERCISE_LIBRARY.map((entry) => entry.key).sort(),
      );
      const bench = find(rows, 'bench-press');
      expect(bench).toMatchObject({
        type: 'weight-reps',
        muscle_groups: ['chest', 'triceps'],
        retired: false,
      });
      expect(bench.aliases).toEqual(expect.arrayContaining(['borstdrukken', 'bench']));
      expect(find(rows, 'romanian-deadlift').aliases).toContain('rdl');
      expect(logs.join('\n')).toContain('Exercise library: 122 added, 0 updated');
    });
  });

  it('running it twice changes nothing', async () => {
    await withFreshDatabase(async (client) => {
      await release(client.db, options, () => {});
      const before = await table(client);

      const logs: string[] = [];
      await release(client.db, options, (message) => logs.push(message));

      expect(await table(client)).toEqual(before);
      expect(logs.join('\n')).toContain('Exercise library: 0 added, 0 updated, 122 unchanged');
    });
  });

  it('adds a new key, updates changed fields and retires, on the same row', async () => {
    await withFreshDatabase(async (client) => {
      await release(client.db, options, () => {});
      const before = await table(client);

      const changed: LibraryExercise[] = EXERCISE_LIBRARY.map((entry) => {
        if (entry.key === 'plank') return { ...entry, muscleGroups: ['core', 'full-body'] };
        if (entry.key === 'bench-press')
          return { ...entry, aliases: [...entry.aliases, 'flatbench'] };
        if (entry.key === 'superman') return { ...entry, retired: true };
        return entry;
      });
      const added: LibraryExercise = {
        key: 'synthetic-new-exercise',
        type: 'time',
        muscleGroups: ['core'],
        aliases: [],
        retired: false,
      };
      const result = await syncExerciseLibrary(client.db, [...changed, added]);
      expect(result).toEqual({ added: 1, updated: 3, unchanged: 119 });

      const after = await table(client);
      expect(after).toHaveLength(123);
      expect(find(after, 'plank').muscle_groups).toEqual(['core', 'full-body']);
      expect(find(after, 'bench-press').aliases).toContain('flatbench');
      expect(find(after, 'superman').retired).toBe(true);
      expect(find(after, 'synthetic-new-exercise').type).toBe('time');
      // The same key stays the same row: what points at it keeps pointing at it.
      for (const key of ['plank', 'bench-press', 'superman']) {
        expect(find(after, key).id).toBe(find(before, key).id);
      }
      // Rows nothing changed for are not touched.
      expect(find(after, 'lunge').updated_at).toEqual(find(before, 'lunge').updated_at);

      // Syncing the same content again changes nothing.
      expect(await syncExerciseLibrary(client.db, [...changed, added])).toEqual({
        added: 0,
        updated: 0,
        unchanged: 123,
      });
      expect(await table(client)).toEqual(after);
    });
  });

  it('can bring a retired exercise back', async () => {
    await withFreshDatabase(async (client) => {
      await runMigrations(client.db);
      const retired = EXERCISE_LIBRARY.map((entry) =>
        entry.key === 'superman' ? { ...entry, retired: true } : entry,
      );
      await syncExerciseLibrary(client.db, retired);
      expect(find(await table(client), 'superman').retired).toBe(true);
      await syncExerciseLibrary(client.db, EXERCISE_LIBRARY);
      expect(find(await table(client), 'superman').retired).toBe(false);
    });
  });

  it('fails when a key in the table is missing from the file, and changes nothing', async () => {
    await withFreshDatabase(async (client) => {
      await release(client.db, options, () => {});
      const before = await table(client);

      const withoutLunge = EXERCISE_LIBRARY.filter((entry) => entry.key !== 'lunge').map((entry) =>
        entry.key === 'plank' ? { ...entry, aliases: ['changed alias'] } : entry,
      );

      await expect(syncExerciseLibrary(client.db, withoutLunge)).rejects.toThrow(/lunge.*retire/is);
      await expect(
        release(client.db, { ...options, library: withoutLunge }, () => {}),
      ).rejects.toThrow(/lunge/);
      expect(await table(client)).toEqual(before);
    });
  });

  it('refuses a file with a duplicated key', async () => {
    await withFreshDatabase(async (client) => {
      const first = EXERCISE_LIBRARY[0] as LibraryExercise;
      await release(client.db, options, () => {});
      await expect(syncExerciseLibrary(client.db, [...EXERCISE_LIBRARY, first])).rejects.toThrow(
        /duplicate.*bench-press/i,
      );
    });
  });

  it("AC5: the name is the catalog's for the key, so a corrected name needs no change to the row", async () => {
    await withFreshDatabase(async (client) => {
      await release(client.db, options, () => {});
      const before = find(await table(client), 'bench-press');

      // Correcting a name changes the catalog only; the sync that follows finds nothing to write
      // and the key carries the corrected name wherever it is resolved.
      const logs: string[] = [];
      await release(client.db, options, (message) => logs.push(message));
      const after = find(await table(client), 'bench-press');
      expect(after).toEqual(before);
      expect(logs.join('\n')).toContain('0 updated');

      expect(libraryMessageKey('names', after.key)).toBe('exercises.names.benchPress');
      expect(messages['nl-NL'].exercises.names.benchPress).toBe('Bankdrukken');
    });
  });
});
