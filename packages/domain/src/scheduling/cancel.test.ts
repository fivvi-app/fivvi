import { zonedTime } from '@fivvi/testing/clock';
import { describe, expect, it } from 'vitest';
import { type CancellablePrivateSession, cancelPrivateSession } from './cancel.ts';

// Synthetic people as in F026's spec: Sarah and Tom (Trainers of John's Gym), John (Owner), Anna and
// Mark (clients). Thursday 24 September 2026, Europe/Amsterdam (summer time): Sarah's private
// session with Anna 09:00-10:00, cancelled on Tuesday 22 September.

const SARAH = 'team-member-sarah';
const TOM = 'team-member-tom';
const JOHN = 'team-member-john';
const ANNA = 'client-anna';
const MARK = 'client-mark';

const sarah = { role: 'trainer', teamMemberId: SARAH } as const;
const tom = { role: 'trainer', teamMemberId: TOM } as const;
const john = { role: 'owner', teamMemberId: JOHN } as const;

const NOW = zonedTime('2026-09-22T11:30');

const session = (
  overrides: Partial<CancellablePrivateSession> = {},
): CancellablePrivateSession => ({
  status: 'scheduled',
  version: 3,
  startsAt: zonedTime('2026-09-24T09:00'),
  trainerTeamMemberId: SARAH,
  participants: [{ clientId: ANNA, status: 'booked' }],
  ...overrides,
});

describe('F026 cancel a private session', () => {
  it('AC1: a client-initiated cancel records the time, the team member and the initiator, and cancels the place', () => {
    const decision = cancelPrivateSession(
      session(),
      sarah,
      { initiator: 'client', notify: false, expectedVersion: 3 },
      NOW,
    );
    expect(decision).toEqual({
      outcome: 'cancelled',
      cancelledAt: NOW,
      cancelledByTeamMemberId: SARAH,
      initiator: 'client',
      participantChanges: [{ clientId: ANNA, from: 'booked', to: 'cancelled' }],
      notifyClientIds: [],
    });
  });

  it('AC2: a workspace cancel with notify asks for an email to the client; without it, none', () => {
    const asked = cancelPrivateSession(
      session({ trainerTeamMemberId: TOM, participants: [{ clientId: MARK, status: 'booked' }] }),
      john,
      { initiator: 'workspace', notify: true, expectedVersion: 3 },
      NOW,
    );
    expect(asked).toMatchObject({
      outcome: 'cancelled',
      initiator: 'workspace',
      cancelledByTeamMemberId: JOHN,
      notifyClientIds: [MARK],
    });
    const silent = cancelPrivateSession(
      session(),
      john,
      { initiator: 'workspace', notify: false, expectedVersion: 3 },
      NOW,
    );
    expect(silent).toMatchObject({ outcome: 'cancelled', notifyClientIds: [] });
  });

  it('AC5: a Trainer cancels their own session, not another Trainer’s; the Owner cancels any', () => {
    const request = { initiator: 'client', notify: false, expectedVersion: 3 } as const;
    expect(cancelPrivateSession(session(), sarah, request, NOW).outcome).toBe('cancelled');
    expect(cancelPrivateSession(session(), tom, request, NOW)).toEqual({
      outcome: 'refused',
      reason: 'not-allowed',
    });
    expect(cancelPrivateSession(session(), john, request, NOW).outcome).toBe('cancelled');
  });

  it('AC5: a session whose trainer ended can be cancelled by the Owner only', () => {
    const request = { initiator: 'workspace', notify: false, expectedVersion: 3 } as const;
    const orphan = session({ trainerTeamMemberId: null });
    expect(cancelPrivateSession(orphan, sarah, request, NOW)).toEqual({
      outcome: 'refused',
      reason: 'not-allowed',
    });
    expect(cancelPrivateSession(orphan, john, request, NOW).outcome).toBe('cancelled');
  });

  it('AC10: a second cancel is refused as not scheduled, before the version is compared', () => {
    const decision = cancelPrivateSession(
      session({ status: 'cancelled', version: 4 }),
      sarah,
      { initiator: 'client', notify: false, expectedVersion: 3 },
      NOW,
    );
    expect(decision).toEqual({ outcome: 'refused', reason: 'not-scheduled' });
  });

  it('AC10: who may comes before the state, so a stranger learns nothing about a cancelled session', () => {
    const decision = cancelPrivateSession(
      session({ status: 'cancelled' }),
      tom,
      { initiator: 'client', notify: false, expectedVersion: 3 },
      NOW,
    );
    expect(decision).toEqual({ outcome: 'refused', reason: 'not-allowed' });
  });

  it('AC11: a stale version is refused', () => {
    const decision = cancelPrivateSession(
      session({ version: 4 }),
      sarah,
      { initiator: 'client', notify: false, expectedVersion: 3 },
      NOW,
    );
    expect(decision).toEqual({ outcome: 'refused', reason: 'stale-version' });
  });

  it('a caller that holds the session itself (the handover) leaves the version out', () => {
    const decision = cancelPrivateSession(
      session({ version: 9 }),
      john,
      { initiator: 'workspace', notify: true },
      NOW,
    );
    expect(decision.outcome).toBe('cancelled');
  });

  it('AC9: a session that has started is recorded and nobody is emailed, whatever notify says', () => {
    const decision = cancelPrivateSession(
      session({ startsAt: zonedTime('2026-09-22T11:00') }),
      john,
      { initiator: 'workspace', notify: true, expectedVersion: 3 },
      NOW,
    );
    expect(decision).toMatchObject({ outcome: 'cancelled', notifyClientIds: [] });
  });

  it('AC9: a session that starts this very instant has started', () => {
    const decision = cancelPrivateSession(
      session({ startsAt: NOW }),
      john,
      { initiator: 'workspace', notify: true, expectedVersion: 3 },
      NOW,
    );
    expect(decision).toMatchObject({ outcome: 'cancelled', notifyClientIds: [] });
  });

  it('a duo: both places are cancelled and each client is emailed once', () => {
    const decision = cancelPrivateSession(
      session({
        participants: [
          { clientId: ANNA, status: 'booked' },
          { clientId: MARK, status: 'booked' },
        ],
      }),
      john,
      { initiator: 'workspace', notify: true, expectedVersion: 3 },
      NOW,
    );
    expect(decision).toMatchObject({
      outcome: 'cancelled',
      participantChanges: [
        { clientId: ANNA, from: 'booked', to: 'cancelled' },
        { clientId: MARK, from: 'booked', to: 'cancelled' },
      ],
      notifyClientIds: [ANNA, MARK],
    });
  });

  it('a place that was cancelled already stays as it is and is not emailed again', () => {
    const decision = cancelPrivateSession(
      session({
        participants: [
          { clientId: ANNA, status: 'cancelled' },
          { clientId: MARK, status: 'booked' },
        ],
      }),
      john,
      { initiator: 'workspace', notify: true, expectedVersion: 3 },
      NOW,
    );
    expect(decision).toMatchObject({
      outcome: 'cancelled',
      participantChanges: [{ clientId: MARK, from: 'booked', to: 'cancelled' }],
      notifyClientIds: [MARK],
    });
  });

  it('a place that was marked attended or no-show is cancelled too, with its own from', () => {
    const decision = cancelPrivateSession(
      session({
        startsAt: zonedTime('2026-09-22T09:00'),
        participants: [{ clientId: ANNA, status: 'no_show' }],
      }),
      john,
      { initiator: 'client', notify: false, expectedVersion: 3 },
      NOW,
    );
    expect(decision).toMatchObject({
      participantChanges: [{ clientId: ANNA, from: 'no_show', to: 'cancelled' }],
    });
  });
});
