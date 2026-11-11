import { messages } from '@fivvi/i18n';
import { describe, expect, it } from 'vitest';
import {
  findLibraryProblems,
  type LibraryExercise,
  type LibraryMessages,
  libraryMessageKey,
} from './content.ts';
import { EXERCISE_LIBRARY } from './exercises.ts';

// Synthetic fixtures: a tiny library with its own catalogs.
const exercise = (overrides: Partial<LibraryExercise> = {}): LibraryExercise => ({
  key: 'bench-press',
  type: 'weight-reps',
  muscleGroups: ['chest'],
  aliases: ['bench'],
  retired: false,
  ...overrides,
});

const catalog = (names: Record<string, string>): LibraryMessages => ({
  exercises: {
    names,
    muscleGroups: Object.fromEntries(
      [
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
        'fullBody',
      ].map((name) => [name, name]),
    ),
    types: { weightReps: 'a', repsOnly: 'b', time: 'c', distanceTime: 'd' },
  },
});

const goodMessages = {
  'nl-NL': catalog({ benchPress: 'Bankdrukken' }),
  en: catalog({ benchPress: 'Bench press' }),
};

describe('F039 AC9: the library content check', () => {
  it('finds nothing wrong with a complete exercise', () => {
    expect(findLibraryProblems({ exercises: [exercise()], messages: goodMessages })).toEqual([]);
  });

  it('fails when a key is duplicated', () => {
    const problems = findLibraryProblems({
      exercises: [exercise(), exercise()],
      messages: goodMessages,
    });
    expect(problems).toContainEqual(expect.stringContaining('bench-press'));
    expect(problems.join('\n')).toMatch(/duplicate/i);
  });

  it.each(['nl-NL', 'en'] as const)('fails when the %s name is missing', (locale) => {
    const broken = { ...goodMessages, [locale]: catalog({}) };
    const problems = findLibraryProblems({ exercises: [exercise()], messages: broken });
    expect(problems.join('\n')).toContain(`${locale} name`);
  });

  it('fails when the type is unknown', () => {
    const problems = findLibraryProblems({
      exercises: [exercise({ type: 'weight-time' as never })],
      messages: goodMessages,
    });
    expect(problems.join('\n')).toMatch(/unknown type/i);
  });

  it('fails when the type is missing', () => {
    const { type: _type, ...withoutType } = exercise();
    const problems = findLibraryProblems({
      exercises: [withoutType as unknown as LibraryExercise],
      messages: goodMessages,
    });
    expect(problems).toContainEqual('bench-press: no type');
  });

  it('fails when the key is not kebab-case', () => {
    const problems = findLibraryProblems({
      exercises: [exercise({ key: 'Bench_Press' })],
      messages: goodMessages,
    });
    expect(problems.join('\n')).toMatch(/invalid key/i);
  });

  it('fails when the type has no name in a catalog', () => {
    const broken = catalog({ benchPress: 'x' });
    delete (broken.exercises.types as Record<string, string>).repsOnly;
    const problems = findLibraryProblems({
      exercises: [exercise()],
      messages: { ...goodMessages, en: broken },
    });
    expect(problems.join('\n')).toContain('exercises.types.repsOnly');
  });

  it('fails when an exercise has no muscle group', () => {
    const problems = findLibraryProblems({
      exercises: [exercise({ muscleGroups: [] })],
      messages: goodMessages,
    });
    expect(problems.join('\n')).toMatch(/at least one muscle group/i);
  });

  it('fails when a muscle group is unknown or repeated', () => {
    const unknown = findLibraryProblems({
      exercises: [exercise({ muscleGroups: ['neck' as never] })],
      messages: goodMessages,
    });
    expect(unknown.join('\n')).toMatch(/unknown muscle group "neck"/i);
    const repeated = findLibraryProblems({
      exercises: [exercise({ muscleGroups: ['chest', 'chest'] })],
      messages: goodMessages,
    });
    expect(repeated.join('\n')).toMatch(/repeats muscle group/i);
  });

  it('fails when a muscle group has no name in a catalog', () => {
    const broken = catalog({ benchPress: 'x' });
    delete (broken.exercises.muscleGroups as Record<string, string>).chest;
    const problems = findLibraryProblems({
      exercises: [exercise()],
      messages: { ...goodMessages, 'nl-NL': broken },
    });
    expect(problems.join('\n')).toContain('exercises.muscleGroups.chest');
  });

  it('fails when a catalog has a name for an exercise that is not in the file', () => {
    const extra = { ...goodMessages, en: catalog({ benchPress: 'x', ghost: 'Ghost' }) };
    const problems = findLibraryProblems({ exercises: [exercise()], messages: extra });
    expect(problems.join('\n')).toContain('exercises.names.ghost');
  });

  it('fails when an alias is blank or repeated', () => {
    const problems = findLibraryProblems({
      exercises: [exercise({ aliases: ['bench', ' ', 'bench'] })],
      messages: goodMessages,
    });
    expect(problems.join('\n')).toMatch(/blank alias/i);
    expect(problems.join('\n')).toMatch(/repeats alias/i);
  });

  it('fails when two exercises share an alias, whatever its case', () => {
    const problems = findLibraryProblems({
      exercises: [
        exercise({ aliases: ['optrekken'] }),
        exercise({ key: 'pull-up', aliases: ['Optrekken'] }),
      ],
      messages: {
        'nl-NL': catalog({ benchPress: 'Bankdrukken', pullUp: 'Pull-up' }),
        en: catalog({ benchPress: 'Bench press', pullUp: 'Pull-up' }),
      },
    });
    expect(problems.join('\n')).toMatch(/alias "Optrekken" is also an alias of bench-press/);
  });

  it('fails when a key that exists in the table was removed from the file instead of retired', () => {
    const problems = findLibraryProblems({
      exercises: [exercise()],
      messages: goodMessages,
      tableKeys: ['bench-press', 'old-press'],
    });
    expect(problems.join('\n')).toContain('old-press');
    expect(problems.join('\n')).toMatch(/retire/i);
  });

  it('accepts a retired exercise that is still in the file', () => {
    expect(
      findLibraryProblems({
        exercises: [exercise({ key: 'old-press', retired: true })],
        messages: { 'nl-NL': catalog({ oldPress: 'Oud' }), en: catalog({ oldPress: 'Old' }) },
        tableKeys: ['old-press'],
      }),
    ).toEqual([]);
  });

  it('maps a key to its catalog path in camelCase', () => {
    expect(libraryMessageKey('names', 't-bar-row')).toBe('exercises.names.tBarRow');
    expect(libraryMessageKey('muscleGroups', 'full-body')).toBe('exercises.muscleGroups.fullBody');
    expect(libraryMessageKey('types', 'distance-time')).toBe('exercises.types.distanceTime');
  });
});

describe('F039 the starting library', () => {
  it('has 122 exercises and passes the content check against the real catalogs', () => {
    expect(EXERCISE_LIBRARY).toHaveLength(122);
    expect(findLibraryProblems({ exercises: EXERCISE_LIBRARY, messages })).toEqual([]);
  });

  it('names the spec examples in Dutch and English', () => {
    expect(messages['nl-NL'].exercises.names.benchPress).toBe('Bankdrukken');
    expect(messages.en.exercises.names.benchPress).toBe('Bench press');
    expect(messages['nl-NL'].exercises.names.romanianDeadlift).toBe('Roemeense deadlift');
    expect(messages['nl-NL'].exercises.muscleGroups.chest).toBe('borst');
    expect(messages.en.exercises.muscleGroups.fullBody).toBe('full body');
  });

  it('gives no alias to two exercises', () => {
    const owner = new Map<string, string>();
    const shared: string[] = [];
    for (const entry of EXERCISE_LIBRARY) {
      for (const alias of entry.aliases) {
        const other = owner.get(alias.trim().toLowerCase());
        if (other) shared.push(`${alias}: ${other}, ${entry.key}`);
        owner.set(alias.trim().toLowerCase(), entry.key);
      }
    }
    expect(shared).toEqual([]);
  });

  it('carries the aliases the spec names', () => {
    const find = (key: string) => EXERCISE_LIBRARY.find((entry) => entry.key === key);
    expect(find('bench-press')?.aliases).toEqual(expect.arrayContaining(['borstdrukken', 'bench']));
    expect(find('romanian-deadlift')?.aliases).toContain('rdl');
  });
});
