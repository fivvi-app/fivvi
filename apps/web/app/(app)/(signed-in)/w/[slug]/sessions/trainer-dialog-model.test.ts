import { describe, expect, it } from 'vitest';
import type { Session } from './sessions-client';
import { assignKind, notifyCount, scopesOffered } from './trainer-dialog-model';

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

  it('a one-off class date that has a trainer is not offered the dialog until F024', () => {
    expect(assignKind({ ...base, type: 'group', trainer: sarah })).toBeNull();
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

  it('AC2: a date with a trainer (the substitution is F024): only Deze en alle volgende lessen', () => {
    expect(scopesOffered({ ...base, type: 'group', series, trainer: sarah })).toEqual([
      'following',
    ]);
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
