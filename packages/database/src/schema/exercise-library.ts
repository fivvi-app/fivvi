import { sql } from 'drizzle-orm';
import { boolean, check, pgTable, text } from 'drizzle-orm/pg-core';
import { id, timestamps } from './columns.ts';

/**
 * What a set of an exercise records (`PRODUCT.md §38`): kg and reps (the default), reps only,
 * seconds shown as m:ss, or metres and m:ss.
 */
export const EXERCISE_TYPES = ['weight-reps', 'reps-only', 'time', 'distance-time'] as const;
export type ExerciseType = (typeof EXERCISE_TYPES)[number];

/** The fixed list of target muscle groups; their names are `exercises.muscleGroups.*` in `packages/i18n`. */
export const MUSCLE_GROUPS = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'forearms',
  'quadriceps',
  'hamstrings',
  'glutes',
  'calves',
  'adductors',
  'core',
  'cardio',
  'full-body',
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

const sqlList = (values: readonly string[]) =>
  sql.raw(values.map((value) => `'${value}'`).join(', '));

/**
 * The exercise library (F039): the same list of exercises for every workspace, synced from
 * `src/library/exercises.ts` by the release step. Platform data, not tenant data: no
 * `organization_id`, and nothing about any workspace or person. The Dutch and English names are
 * not here; they live in `packages/i18n` (`exercises.names.*`), so the parity check covers them.
 * An exercise is retired, never deleted: workouts and templates keep pointing at its key.
 */
export const exerciseLibrary = pgTable(
  'exercise_library',
  {
    id: id(),
    key: text('key').notNull().unique(),
    type: text('type').notNull(),
    muscleGroups: text('muscle_groups').array().notNull(),
    /** Search words in Dutch and English, never shown. */
    aliases: text('aliases').array().notNull().default(sql`'{}'::text[]`),
    retired: boolean('retired').notNull().default(false),
    ...timestamps(),
  },
  (table) => [
    check('exercise_library_key_format', sql`${table.key} ~ '^[a-z][a-z0-9]*(-[a-z0-9]+)*$'`),
    check('exercise_library_type_known', sql`${table.type} in (${sqlList(EXERCISE_TYPES)})`),
    check(
      'exercise_library_muscle_groups_known',
      sql`cardinality(${table.muscleGroups}) >= 1 and ${table.muscleGroups} <@ array[${sqlList(MUSCLE_GROUPS)}]::text[]`,
    ),
  ],
);

export type ExerciseLibraryRow = typeof exerciseLibrary.$inferSelect;
