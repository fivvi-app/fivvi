import { zonedTime } from '@fivvi/testing/clock';
import { describe, expect, it } from 'vitest';
import { findTrainerConflicts, type TrainerBusySession } from './trainer-conflicts.ts';

// F023 (spec #459), AC5 and AC7: the double-booking rule, one place for web and apps. Synthetic
// people: Tom has Mark on Thursday 24 September 2026, 09:00 to 10:00 (Europe/Amsterdam).

const TOM = 'trainer-profile-tom';
const SARAH = 'trainer-profile-sarah';

const at = (time: string) => zonedTime(`2026-09-24T${time}`);

const session = (overrides: Partial<TrainerBusySession> & { id: string }): TrainerBusySession => ({
  type: 'private',
  status: 'scheduled',
  trainerProfileId: TOM,
  startsAt: at('09:00'),
  endsAt: at('10:00'),
  ...overrides,
});

const MARK = session({ id: 'mark' });

describe('F023 AC5: findTrainerConflicts, half-open intervals', () => {
  it('AC5: 09:30 to 10:30 overlaps 09:00 to 10:00', () => {
    expect(findTrainerConflicts([MARK], TOM, at('09:30'), at('10:30')).map((s) => s.id)).toEqual([
      'mark',
    ]);
  });

  it('AC5: 10:00 to 11:00 does not: back-to-back is no overlap', () => {
    expect(findTrainerConflicts([MARK], TOM, at('10:00'), at('11:00'))).toEqual([]);
  });

  it('AC5: 08:00 to 09:00 does not either, at the start edge', () => {
    expect(findTrainerConflicts([MARK], TOM, at('08:00'), at('09:00'))).toEqual([]);
  });

  it('AC5: a session inside, around, and one minute over the edge all overlap', () => {
    for (const [from, to] of [
      ['09:15', '09:45'],
      ['08:00', '11:00'],
      ['09:59', '11:00'],
      ['08:00', '09:01'],
    ] as const) {
      expect(findTrainerConflicts([MARK], TOM, at(from), at(to))).toHaveLength(1);
    }
  });

  it('AC5: the same hour overlaps', () => {
    expect(findTrainerConflicts([MARK], TOM, at('09:00'), at('10:00'))).toHaveLength(1);
  });

  it('AC5: another trainer’s sessions never count', () => {
    const sarahs = session({ id: 'sarah', trainerProfileId: SARAH });
    expect(findTrainerConflicts([sarahs], TOM, at('09:00'), at('10:00'))).toEqual([]);
  });

  it('AC5: a session without a trainer never counts', () => {
    const openGym = session({ id: 'gym', type: 'open_gym', trainerProfileId: null });
    expect(findTrainerConflicts([openGym], TOM, at('09:00'), at('10:00'))).toEqual([]);
  });

  it('AC5: group classes count, and the result is in the order of their start', () => {
    const late = session({ id: 'late', type: 'group', startsAt: at('09:40'), endsAt: at('10:40') });
    const early = session({ id: 'early', startsAt: at('08:30'), endsAt: at('09:20') });
    expect(
      findTrainerConflicts([late, MARK, early], TOM, at('09:00'), at('10:00')).map((s) => s.id),
    ).toEqual(['early', 'mark', 'late']);
  });
});

describe('F023 AC7: what never conflicts', () => {
  it('AC7: a cancelled session never conflicts', () => {
    const cancelled = session({ id: 'cancelled', status: 'cancelled' });
    expect(findTrainerConflicts([cancelled], TOM, at('09:00'), at('10:00'))).toEqual([]);
  });

  it('AC7: the session being moved does not conflict with itself', () => {
    expect(findTrainerConflicts([MARK], TOM, at('09:30'), at('10:30'), 'mark')).toEqual([]);
  });

  it('AC7: other sessions still conflict while one is excluded', () => {
    const other = session({ id: 'other', startsAt: at('09:30'), endsAt: at('10:30') });
    expect(
      findTrainerConflicts([MARK, other], TOM, at('09:45'), at('10:15'), 'mark').map((s) => s.id),
    ).toEqual(['other']);
  });

  it('AC7: keeps what the caller attached to a session, so a route can name it', () => {
    const named = { ...MARK, displayName: 'Mark Jansen' };
    expect(findTrainerConflicts([named], TOM, at('09:30'), at('10:30'))).toEqual([named]);
  });

  it('AC7: an empty or inverted window overlaps nothing', () => {
    expect(findTrainerConflicts([MARK], TOM, at('09:30'), at('09:30'))).toEqual([]);
    expect(findTrainerConflicts([MARK], TOM, at('10:30'), at('09:30'))).toEqual([]);
  });
});

describe('F023 AC5: daylight saving time', () => {
  it('compares instants, so the repeated hour of 25 October 2026 is two different hours', () => {
    const first = zonedTime('2026-10-25T02:30', { disambiguation: 'earlier' });
    // 02:30 happens twice; `earlier` takes the first (summer time), one hour later is the second.
    const second = new Date(first.getTime() + 60 * 60_000);
    const busy = session({
      id: 'dst',
      startsAt: first,
      endsAt: new Date(first.getTime() + 30 * 60_000),
    });
    expect(
      findTrainerConflicts([busy], TOM, second, new Date(second.getTime() + 30 * 60_000)),
    ).toEqual([]);
    expect(
      findTrainerConflicts([busy], TOM, first, new Date(first.getTime() + 15 * 60_000)),
    ).toHaveLength(1);
  });
});
