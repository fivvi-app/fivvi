import { sql } from 'drizzle-orm';
import type { DatabaseExecutor } from '../client.ts';
import { exerciseLibrary } from '../schema/exercise-library.ts';
import type { LibraryExercise } from './content.ts';
import { EXERCISE_LIBRARY } from './exercises.ts';

export interface LibrarySyncResult {
  added: number;
  updated: number;
  unchanged: number;
}

/** The log line of a sync; the release step and `pnpm db:migrate` print the same one. */
export const describeLibrarySync = (result: LibrarySyncResult): string =>
  `Exercise library: ${result.added} added, ${result.updated} updated, ${result.unchanged} unchanged.`;

/**
 * Makes the `exercise_library` table match the data file (F039), in every environment, production
 * included (production doesn't run the seed). New keys are added, changed fields (type, muscle
 * groups, aliases, retired) are updated on the same row, and a row whose fields already match is not
 * touched, so running it twice changes nothing. A key in the table that is missing from the file
 * fails the sync before anything is written: retire the exercise (`retired: true`) instead of
 * removing it, because templates and past workouts point at its key.
 */
export function syncExerciseLibrary(
  db: DatabaseExecutor,
  exercises: readonly LibraryExercise[] = EXERCISE_LIBRARY,
): Promise<LibrarySyncResult> {
  return db.transaction(async (tx) => {
    const keys = new Set<string>();
    for (const exercise of exercises) {
      if (keys.has(exercise.key)) {
        throw new Error(`Exercise library: duplicate key ${exercise.key} in the data file.`);
      }
      keys.add(exercise.key);
    }

    // One release at a time, so two deploys never interleave their writes.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('fivvi.exercise_library_sync'))`);

    const existing = await tx.select({ key: exerciseLibrary.key }).from(exerciseLibrary);
    const missing = existing.map((row) => row.key).filter((key) => !keys.has(key));
    if (missing.length > 0) {
      throw new Error(
        `Exercise library: ${missing.sort().join(', ')} ${missing.length === 1 ? 'is' : 'are'} in the table but missing from the data file. Retire an exercise (retired: true), never remove it.`,
      );
    }

    if (exercises.length === 0) return { added: 0, updated: 0, unchanged: 0 };

    const written = await tx
      .insert(exerciseLibrary)
      .values(
        exercises.map((exercise) => ({
          key: exercise.key,
          type: exercise.type,
          muscleGroups: [...exercise.muscleGroups],
          aliases: [...exercise.aliases],
          retired: exercise.retired,
        })),
      )
      .onConflictDoUpdate({
        target: exerciseLibrary.key,
        set: {
          type: sql`excluded.type`,
          muscleGroups: sql`excluded.muscle_groups`,
          aliases: sql`excluded.aliases`,
          retired: sql`excluded.retired`,
          updatedAt: sql`now()`,
        },
        setWhere: sql`(${exerciseLibrary.type}, ${exerciseLibrary.muscleGroups}, ${exerciseLibrary.aliases}, ${exerciseLibrary.retired}) is distinct from (excluded.type, excluded.muscle_groups, excluded.aliases, excluded.retired)`,
      })
      .returning({ inserted: sql<boolean>`(xmax = 0)` });

    const added = written.filter((row) => row.inserted).length;
    return {
      added,
      updated: written.length - added,
      unchanged: exercises.length - written.length,
    };
  });
}
