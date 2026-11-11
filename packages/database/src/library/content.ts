import {
  EXERCISE_TYPES,
  type ExerciseType,
  MUSCLE_GROUPS,
  type MuscleGroup,
} from '../schema/exercise-library.ts';

/** One exercise of the starting library, as the versioned data file holds it (F039). */
export interface LibraryExercise {
  /** Stable key: never changes, never reused. Workouts and templates point at it. */
  key: string;
  type: ExerciseType;
  /** One or more of the fixed muscle groups. */
  muscleGroups: readonly MuscleGroup[];
  /** Search words in Dutch and English, never shown. */
  aliases: readonly string[];
  /** No longer offered; stays for templates and past workouts. Retire, never remove. */
  retired: boolean;
}

/** The part of the catalogs the content check reads. */
export interface LibraryMessages {
  exercises: {
    names: Record<string, string>;
    muscleGroups: Record<string, string>;
    types: Record<string, string>;
  };
}

export type LibraryMessageKind = 'names' | 'muscleGroups' | 'types';

const LIBRARY_LOCALES = ['nl-NL', 'en'] as const;

const camelCase = (key: string) =>
  key.replace(/-([a-z0-9])/g, (_match, char: string) => char.toUpperCase());

/**
 * The catalog path of a name, a muscle group or a type: `libraryMessageKey('names', 't-bar-row')`
 * is `exercises.names.tBarRow`. Catalog segments are lowerCamelCase; keys in the data file and the
 * table are kebab-case.
 */
export function libraryMessageKey(kind: LibraryMessageKind, key: string): string {
  return `exercises.${kind}.${camelCase(key)}`;
}

export interface LibraryContent {
  exercises: readonly LibraryExercise[];
  messages: Record<(typeof LIBRARY_LOCALES)[number], LibraryMessages>;
  /** Keys that exist in the table. Each must still be in the file (retired, not removed). */
  tableKeys?: readonly string[];
}

const isFilled = (value: unknown): boolean => typeof value === 'string' && value.trim() !== '';

/** Everything wrong with the library content (F039, AC9); an empty list means it is complete. */
export function findLibraryProblems({
  exercises,
  messages,
  tableKeys = [],
}: LibraryContent): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  const known = new Set<string>();

  for (const exercise of exercises) {
    const { key } = exercise;
    if (seen.has(key)) problems.push(`${key}: duplicate key`);
    seen.add(key);
    known.add(camelCase(key));

    if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(key)) problems.push(`${key}: invalid key`);

    for (const locale of LIBRARY_LOCALES) {
      if (!isFilled(messages[locale].exercises.names[camelCase(key)])) {
        problems.push(`${key}: no ${locale} name (${libraryMessageKey('names', key)})`);
      }
    }

    if (!(EXERCISE_TYPES as readonly string[]).includes(exercise.type)) {
      problems.push(`${key}: unknown type "${exercise.type}"`);
    }

    if (exercise.muscleGroups.length === 0) {
      problems.push(`${key}: needs at least one muscle group`);
    }
    const groups = new Set<string>();
    for (const group of exercise.muscleGroups) {
      if (!(MUSCLE_GROUPS as readonly string[]).includes(group)) {
        problems.push(`${key}: unknown muscle group "${group}"`);
      }
      if (groups.has(group)) problems.push(`${key}: repeats muscle group "${group}"`);
      groups.add(group);
    }

    const aliases = new Set<string>();
    for (const alias of exercise.aliases) {
      if (!isFilled(alias)) {
        problems.push(`${key}: blank alias`);
        continue;
      }
      if (aliases.has(alias)) problems.push(`${key}: repeats alias "${alias}"`);
      aliases.add(alias);
    }
  }

  for (const locale of LIBRARY_LOCALES) {
    for (const type of EXERCISE_TYPES) {
      if (!isFilled(messages[locale].exercises.types[camelCase(type)])) {
        problems.push(`no ${locale} name for type ${libraryMessageKey('types', type)}`);
      }
    }
    for (const group of MUSCLE_GROUPS) {
      if (!isFilled(messages[locale].exercises.muscleGroups[camelCase(group)])) {
        problems.push(`no ${locale} name for ${libraryMessageKey('muscleGroups', group)}`);
      }
    }
    for (const name of Object.keys(messages[locale].exercises.names)) {
      if (!known.has(name)) {
        problems.push(
          `${locale} catalog has exercises.names.${name}, but no such exercise is in the file`,
        );
      }
    }
  }

  const missing = tableKeys.filter((key) => !seen.has(key));
  if (missing.length > 0) {
    problems.push(
      `removed from the file instead of retired: ${missing.join(', ')}. Set retired: true and keep the exercise in the file.`,
    );
  }

  return problems;
}
