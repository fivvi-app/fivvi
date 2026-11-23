import { fixedClock, zonedTime } from '@fivvi/testing/clock';
import { describe, expect, it } from 'vitest';
import {
  ATTENDANCE_OPENS_MINUTES_BEFORE,
  type AttendanceParticipant,
  type AttendanceSession,
  attendanceOpensAt,
  attendanceSummary,
  changeParticipantStatus,
  needsAttendance,
} from './attendance.ts';

// Synthetic people as in F025's spec: Sarah (Trainer of John's Gym), Mike (another Trainer), John
// (Owner). Tuesday 22 September 2026, Europe/Amsterdam (summer time): Sarah's private session with
// Anna 09:00-10:00 and "Kracht" 18:00-19:00.

const SARAH = 'team-member-sarah';
const MIKE = 'team-member-mike';
const JOHN = 'team-member-john';

const sarah = { role: 'trainer', teamMemberId: SARAH } as const;
const mike = { role: 'trainer', teamMemberId: MIKE } as const;
const john = { role: 'owner', teamMemberId: JOHN } as const;

const at = (local: string) => zonedTime(`2026-09-22T${local}`);

const session = (overrides: Partial<AttendanceSession> = {}): AttendanceSession => ({
  status: 'scheduled',
  startsAt: at('09:00'),
  endsAt: at('10:00'),
  trainerTeamMemberId: SARAH,
  ...overrides,
});

const participant = (
  status: AttendanceParticipant['status'] = 'booked',
  overrides: Partial<AttendanceSession> = {},
): AttendanceParticipant => ({ status, session: session(overrides) });

describe('F025 change a participant’s status', () => {
  it('AC1: booked to attended and back, each change with its from, to and the time', () => {
    const now = at('10:05');
    expect(changeParticipantStatus(participant('booked'), 'attended', sarah, now)).toEqual({
      outcome: 'changed',
      from: 'booked',
      to: 'attended',
      changedAt: now,
    });
    expect(changeParticipantStatus(participant('attended'), 'booked', sarah, now)).toEqual({
      outcome: 'changed',
      from: 'attended',
      to: 'booked',
      changedAt: now,
    });
  });

  it.each([
    ['booked', 'attended'],
    ['booked', 'no_show'],
    ['attended', 'no_show'],
    ['attended', 'booked'],
    ['no_show', 'attended'],
    ['no_show', 'booked'],
  ] as const)('allows %s to %s', (from, to) => {
    const decision = changeParticipantStatus(participant(from), to, sarah, at('10:05'));
    expect(decision).toMatchObject({ outcome: 'changed', from, to });
  });

  it.each(['booked', 'attended', 'no_show'] as const)(
    'changes nothing when %s is set again (no history row)',
    (status) => {
      expect(changeParticipantStatus(participant(status), status, sarah, at('10:05'))).toEqual({
        outcome: 'unchanged',
      });
    },
  );

  it('AC5: from 30 minutes before the start, not before', () => {
    const class18 = { startsAt: at('18:00'), endsAt: at('19:00') };
    const early = at('17:29');
    expect(
      changeParticipantStatus(participant('booked', class18), 'attended', sarah, early),
    ).toEqual({ outcome: 'refused', reason: 'too-early', opensAt: at('17:30') });
    expect(
      changeParticipantStatus(participant('booked', class18), 'attended', sarah, at('17:30')),
    ).toMatchObject({ outcome: 'changed' });
    expect(ATTENDANCE_OPENS_MINUTES_BEFORE).toBe(30);
  });

  it('AC5: has no end: a session a week ago can still be filled in', () => {
    const later = new Date(at('09:00').getTime() + 7 * 24 * 60 * 60 * 1000);
    expect(changeParticipantStatus(participant('booked'), 'no_show', sarah, later)).toMatchObject({
      outcome: 'changed',
    });
  });

  it('AC5: the 30 minutes are elapsed time, also on the night the clocks change', () => {
    // Sunday 29 March 2026: 02:00 becomes 03:00. A session at 03:00 CEST (01:00 UTC) opens at 00:30 UTC.
    const start = zonedTime('2026-03-29T03:00');
    expect(attendanceOpensAt(start)).toEqual(new Date('2026-03-29T00:30:00Z'));
    // And Sunday 25 October 2026: a session at 03:00 CET (02:00 UTC) opens at 01:30 UTC.
    expect(attendanceOpensAt(new Date('2026-10-25T02:00:00Z'))).toEqual(
      new Date('2026-10-25T01:30:00Z'),
    );
  });

  it('AC6: never on a cancelled session', () => {
    expect(
      changeParticipantStatus(
        participant('booked', { status: 'cancelled' }),
        'attended',
        sarah,
        at('10:05'),
      ),
    ).toEqual({ outcome: 'refused', reason: 'session-cancelled' });
  });

  it('AC6: never from cancelled, a participant who cancelled stays cancelled', () => {
    expect(
      changeParticipantStatus(participant('cancelled'), 'attended', sarah, at('10:05')),
    ).toEqual({ outcome: 'refused', reason: 'participant-cancelled' });
    expect(changeParticipantStatus(participant('cancelled'), 'booked', sarah, at('10:05'))).toEqual(
      {
        outcome: 'refused',
        reason: 'participant-cancelled',
      },
    );
  });

  it('AC7: the session’s trainer may, another Trainer may not, the Owner may for every session', () => {
    const now = at('10:05');
    expect(changeParticipantStatus(participant(), 'attended', sarah, now).outcome).toBe('changed');
    expect(changeParticipantStatus(participant(), 'attended', mike, now)).toEqual({
      outcome: 'refused',
      reason: 'not-allowed',
    });
    expect(changeParticipantStatus(participant(), 'attended', john, now).outcome).toBe('changed');
    // A session without a trainer: only the Owner.
    const nobody = { trainerTeamMemberId: null };
    expect(changeParticipantStatus(participant('booked', nobody), 'attended', sarah, now)).toEqual({
      outcome: 'refused',
      reason: 'not-allowed',
    });
    expect(
      changeParticipantStatus(participant('booked', nobody), 'attended', john, now).outcome,
    ).toBe('changed');
  });

  it('checks who first, then the cancelled session, then the participant, then the time', () => {
    const early = fixedClock('2026-09-22T05:00:00Z').now();
    const cancelled = { status: 'cancelled' } as const;
    expect(
      changeParticipantStatus(participant('cancelled', cancelled), 'attended', mike, early),
    ).toEqual({
      outcome: 'refused',
      reason: 'not-allowed',
    });
    expect(
      changeParticipantStatus(participant('cancelled', cancelled), 'attended', sarah, early),
    ).toEqual({
      outcome: 'refused',
      reason: 'session-cancelled',
    });
    expect(changeParticipantStatus(participant('cancelled'), 'attended', sarah, early)).toEqual({
      outcome: 'refused',
      reason: 'participant-cancelled',
    });
  });
});

describe('F025 needsAttendance', () => {
  it('AC2: needsAttendance after the end only, not during the session', () => {
    const facts = { ...session(), participants: ['booked'] as const };
    expect(needsAttendance(facts, at('09:50'))).toBe(false);
    expect(needsAttendance(facts, at('10:00'))).toBe(true);
    expect(needsAttendance(facts, at('10:05'))).toBe(true);
  });

  it('is false for a cancelled session and when nobody is still booked', () => {
    const now = at('10:05');
    expect(
      needsAttendance({ ...session({ status: 'cancelled' }), participants: ['booked'] }, now),
    ).toBe(false);
    expect(
      needsAttendance({ ...session(), participants: ['attended', 'no_show', 'cancelled'] }, now),
    ).toBe(false);
    expect(needsAttendance({ ...session(), participants: [] }, now)).toBe(false);
  });

  it('is true when one of several is still booked', () => {
    expect(
      needsAttendance(
        { ...session(), participants: ['attended', 'booked', 'cancelled'] },
        at('10:05'),
      ),
    ).toBe(true);
  });

  it('holds across the night the clocks change', () => {
    const start = zonedTime('2026-10-25T01:30');
    const facts = {
      ...session({ startsAt: start, endsAt: new Date(start.getTime() + 3 * 60 * 60 * 1000) }),
      participants: ['booked' as const],
    };
    // Three elapsed hours after 01:30 CEST (23:30 UTC) is 02:30 UTC.
    expect(needsAttendance(facts, new Date('2026-10-25T02:29:00Z'))).toBe(false);
    expect(needsAttendance(facts, new Date('2026-10-25T02:30:00Z'))).toBe(true);
  });
});

describe('F025 attendanceSummary', () => {
  it('counts attended, no-show, open (booked) and cancelled', () => {
    expect(
      attendanceSummary([
        'attended',
        'attended',
        'attended',
        'attended',
        'attended',
        'no_show',
        'cancelled',
      ]),
    ).toEqual({ attended: 5, noShow: 1, open: 0, cancelled: 1 });
    expect(attendanceSummary([])).toEqual({ attended: 0, noShow: 0, open: 0, cancelled: 0 });
    expect(attendanceSummary(['booked', 'booked', 'attended'])).toEqual({
      attended: 1,
      noShow: 0,
      open: 2,
      cancelled: 0,
    });
  });
});
