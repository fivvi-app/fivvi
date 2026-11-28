import { describe, expect, it } from 'vitest';
import type { Session } from './sessions-client';
import {
  assignKind,
  notifyCount,
  orderedCandidates,
  scopesOffered,
  startedBy,
  substitutionOf,
} from './trainer-dialog-model';

const base = { status: 'scheduled' } as const;
const series = {
  id: 'series1',
  weekday: 'TU',
  localStartTime: '18:00',
  occurrenceDate: '2026-10-06',
  changedFields: [],
} satisfies NonNullable<Session['series']>;
const sarah = { id: 'sarah', name: 'Sarah' };

describe('F023 which trainer dialog a session gets', () => {
  it('AC1: a class date without a trainer is assigned one: Trainer toewijzen', () => {
    expect(assignKind({ ...base, type: 'group' })).toBe('assign');
    expect(assignKind({ ...base, type: 'group', series })).toBe('assign');
  });

  it('AC2: a class date of a series with a trainer is substituted: Trainer vervangen', () => {
    expect(assignKind({ ...base, type: 'group', series, trainer: sarah })).toBe('substitute');
  });

  it('F024 AC1: a one-off class date that has a trainer is substituted too', () => {
    expect(assignKind({ ...base, type: 'group', trainer: sarah })).toBe('substitute');
  });

  it('AC8: a private session is changed: Trainer wijzigen, with or without a trainer', () => {
    expect(assignKind({ ...base, type: 'private', trainer: sarah })).toBe('change');
    expect(assignKind({ ...base, type: 'private' })).toBe('change');
  });

  it('a cancelled session and an Open Gym block are never offered it', () => {
    expect(assignKind({ status: 'cancelled', type: 'private', trainer: sarah })).toBeNull();
    expect(assignKind({ status: 'cancelled', type: 'group' })).toBeNull();
    expect(assignKind({ ...base, type: 'open_gym' })).toBeNull();
  });
});

describe('F023 the dates the dialog is for (Voor)', () => {
  it('AC1: a date without a trainer in a series: Alleen deze les and Deze en alle volgende lessen', () => {
    expect(scopesOffered({ ...base, type: 'group', series })).toEqual(['this', 'following']);
  });

  it('a date without a trainer outside a series: only this date', () => {
    expect(scopesOffered({ ...base, type: 'group' })).toEqual(['this']);
  });

  it('F024 AC1: a date of a series with a trainer: Alleen deze les (the substitution) first, then Deze en alle volgende lessen', () => {
    expect(scopesOffered({ ...base, type: 'group', series, trainer: sarah })).toEqual([
      'this',
      'following',
    ]);
  });

  it('F024 AC1: a one-off date with a trainer: only this date', () => {
    expect(scopesOffered({ ...base, type: 'group', trainer: sarah })).toEqual(['this']);
  });

  it('a private session has no scope', () => {
    expect(scopesOffered({ ...base, type: 'private', trainer: sarah })).toEqual([]);
  });
});

describe('F023 how many clients the email would reach', () => {
  const participantsToNotify = { forThisDate: 1, forFollowingDates: 2 };

  it('AC17: Deze en alle volgende lessen counts every affected date, each client once', () => {
    expect(notifyCount({ participantsToNotify }, 'following')).toBe(2);
  });

  it('Alleen deze les and a private session count the one session', () => {
    expect(notifyCount({ participantsToNotify }, 'this')).toBe(1);
    expect(notifyCount({ participantsToNotify }, undefined)).toBe(1);
  });
});

describe('F024 substitution in the dialog', () => {
  const mike = { id: 'mike', name: 'Mike', conflicts: [], laterConflictingDates: 0 };
  const sarahCandidate = { id: 'sarah', name: 'Sarah', conflicts: [], laterConflictingDates: 0 };
  const lisa = { id: 'lisa', name: 'Lisa', conflicts: [], laterConflictingDates: 0 };

  it('AC1: Alleen deze les on a date that has a trainer is a substitution; Deze en alle volgende lessen is not', () => {
    const date = { ...base, type: 'group', series, trainer: sarah } as const;
    expect(substitutionOf(date, 'this')).toBe(true);
    expect(substitutionOf(date, 'following')).toBe(false);
  });

  it('AC1: a date without a trainer is assigned, not substituted, and a private session never is', () => {
    expect(substitutionOf({ ...base, type: 'group', series }, 'this')).toBe(false);
    expect(substitutionOf({ ...base, type: 'private', trainer: sarah }, 'this')).toBe(false);
  });

  it('AC5: on a substituted date the regular trainer comes first, the others keep their order', () => {
    expect(
      orderedCandidates([lisa, sarahCandidate, mike], { substituteFor: { id: 'sarah' } }).map(
        ({ id }) => id,
      ),
    ).toEqual(['sarah', 'lisa', 'mike']);
  });

  it('a date that is no substitution keeps the order of the API', () => {
    expect(orderedCandidates([lisa, mike], {}).map(({ id }) => id)).toEqual(['lisa', 'mike']);
  });

  it('AC8: a date has started once its start is not after now', () => {
    const startsAt = '2026-10-06T16:00:00.000Z';
    expect(startedBy({ startsAt }, new Date('2026-10-06T16:00:00.000Z'))).toBe(true);
    expect(startedBy({ startsAt }, new Date('2026-10-06T15:59:59.000Z'))).toBe(false);
  });
});
