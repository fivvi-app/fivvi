import { fixedClock } from '@fivvi/testing/clock';
import { describe, expect, it } from 'vitest';
import {
  clientFirstName,
  isDuoSession,
  type PlanPrivateSessionFacts,
  PRIVATE_SESSION_MAX_CLIENTS,
  planPrivateSession,
} from './private-session.ts';

// F066 (spec #586), stage 1: a private session takes a second client and is then a duo. Synthetic
// people: Sarah (Trainer), Tom (Trainer), John (Owner), the clients Lisa, Eva and Anna.

const SARAH = 'team-member-sarah';
const TOM = 'team-member-tom';
const JOHN = 'team-member-john';
const [LISA, EVA, ANNA] = ['client-lisa', 'client-eva', 'client-anna'] as const;

const NOW = fixedClock('2026-09-17T10:00:00Z').now();

function facts(overrides: Partial<PlanPrivateSessionFacts> = {}): PlanPrivateSessionFacts {
  return {
    actor: { role: 'trainer', teamMemberId: SARAH },
    trainerTeamMemberId: SARAH,
    trainerTrains: true,
    localDate: '2026-09-24',
    localStart: '09:00',
    durationMinutes: 60,
    timeZone: 'Europe/Amsterdam',
    now: NOW,
    locations: [{ id: 'location-gym', isDefault: true }],
    ...overrides,
  };
}

describe('F066 plan a duo session', () => {
  it('AC1: two different clients make a private session with a capacity of 2', () => {
    expect(planPrivateSession(facts({ clientIds: [LISA, EVA] }))).toMatchObject({
      outcome: 'planned',
      capacity: 2,
    });
  });

  it('a one-client session keeps its capacity of 1, with or without the client named', () => {
    expect(planPrivateSession(facts())).toMatchObject({ outcome: 'planned', capacity: 1 });
    expect(planPrivateSession(facts({ clientIds: [LISA] }))).toMatchObject({
      outcome: 'planned',
      capacity: 1,
    });
  });

  describe('AC2: exactly two different clients', () => {
    it('refuses the same client as first and second', () => {
      expect(planPrivateSession(facts({ clientIds: [LISA, LISA] }))).toEqual({
        outcome: 'refused',
        reason: 'invalid-clients',
      });
    });

    it('refuses a third client', () => {
      expect(planPrivateSession(facts({ clientIds: [LISA, EVA, ANNA] }))).toEqual({
        outcome: 'refused',
        reason: 'invalid-clients',
      });
    });

    it('refuses a session without a client', () => {
      expect(planPrivateSession(facts({ clientIds: [] }))).toEqual({
        outcome: 'refused',
        reason: 'invalid-clients',
      });
    });

    it('a private session is kept at one or two clients', () => {
      expect(PRIVATE_SESSION_MAX_CLIENTS).toBe(2);
    });
  });

  describe('AC3: who may plan a duo', () => {
    it('the Owner plans a duo for any trainer', () => {
      const owner = { role: 'owner', teamMemberId: JOHN } as const;
      expect(
        planPrivateSession(
          facts({ actor: owner, trainerTeamMemberId: TOM, clientIds: [LISA, EVA] }),
        ),
      ).toMatchObject({ outcome: 'planned', trainerTeamMemberId: TOM, capacity: 2 });
    });

    it('a Trainer plans a duo for themself only, and the right is decided before the clients', () => {
      expect(
        planPrivateSession(facts({ trainerTeamMemberId: TOM, clientIds: [LISA, EVA] })),
      ).toEqual({ outcome: 'refused', reason: 'not-allowed' });
      expect(
        planPrivateSession(facts({ trainerTeamMemberId: TOM, clientIds: [LISA, LISA] })),
      ).toEqual({ outcome: 'refused', reason: 'not-allowed' });
    });
  });

  describe('a session is a duo because it has two active participants', () => {
    it.each([
      [0, false],
      [1, false],
      [2, true],
    ])('%i active participants: duo is %s', (active, duo) => {
      expect(isDuoSession(active)).toBe(duo);
    });
  });

  describe('the other client is named by first name only', () => {
    it.each([
      ['Eva Kok', 'Eva'],
      ['Anna de Vries', 'Anna'],
      ['Jan-Willem Smit', 'Jan-Willem'],
      ['  Lisa   Bakker ', 'Lisa'],
      ['Noor', 'Noor'],
    ])('%s is %s', (name, first) => {
      expect(clientFirstName(name)).toBe(first);
    });
  });
});
