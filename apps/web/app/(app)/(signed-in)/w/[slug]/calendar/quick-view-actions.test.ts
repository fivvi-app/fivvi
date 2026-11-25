import { describe, expect, it } from 'vitest';
import type { CalendarAccess } from './quick-view';
import { quickViewActions as actionsAt } from './quick-view-actions';

// F014 AC6 and AC12 (spec #458, ticket #529): what the quick view of a block offers each role. A
// Trainer has `clients.view`, and still has *Openen* only on a colleague's session.
const owner: CalendarAccess = {
  canMoveAny: true,
  canMoveOwn: true,
  canChangeClasses: true,
  canSeeClients: true,
  canManageCalendar: true,
  canAssign: true,
  canCancelAny: true,
  canCancelOwn: true,
  canCopyLink: true,
  teamMemberId: 'm-john',
};
const trainer: CalendarAccess = {
  canMoveAny: false,
  canMoveOwn: true,
  canChangeClasses: false,
  canSeeClients: true,
  canManageCalendar: false,
  canAssign: false,
  canCancelAny: false,
  canCancelOwn: true,
  canCopyLink: true,
  teamMemberId: 'm-sarah',
};
// The tests run "on" 20 November 2026; the dates they start lie ahead of that.
const now = new Date('2026-11-20T09:00:00.000Z');
const quickViewActions = (item: Parameters<typeof actionsAt>[0], access: CalendarAccess) =>
  actionsAt(item, access, now);
const session = (trainerId: string | undefined, overrides = {}) => ({
  type: 'private' as const,
  status: 'scheduled' as const,
  startsAt: '2026-11-24T17:00:00.000Z',
  ...(trainerId ? { trainer: { id: trainerId, name: trainerId } } : {}),
  clients: [{ clientId: 'c1', name: 'Mark Jansen' }],
  ...overrides,
});

describe('F014 AC12: the quick view of a block', () => {
  it('gives the Owner Openen, Verplaatsen and Klantprofiel on any private session', () => {
    expect(quickViewActions(session('m-sarah'), owner)).toEqual({
      open: true,
      move: true,
      change: false,
      clientProfile: true,
      assign: 'change',
      cancel: true,
      cancelClass: false,
      copyLink: false,
    });
  });

  it('gives a Trainer the actions on their own session only', () => {
    expect(quickViewActions(session('m-sarah'), trainer)).toEqual({
      open: true,
      move: true,
      change: false,
      clientProfile: true,
      assign: null,
      cancel: true,
      cancelClass: false,
      copyLink: false,
    });
  });

  it('gives a Trainer Openen only on a colleague’s session, and on one without a trainer', () => {
    const only = {
      open: true,
      move: false,
      change: false,
      clientProfile: false,
      assign: null,
      cancel: false,
      cancelClass: false,
      copyLink: false,
    };
    expect(quickViewActions(session('m-tom'), trainer)).toEqual(only);
    expect(quickViewActions(session(undefined), trainer)).toEqual(only);
  });

  it('has no Verplaatsen on a cancelled session, and Wijzigen only on a class date for who manages classes', () => {
    expect(quickViewActions(session('m-sarah', { status: 'cancelled' }), owner).move).toBe(false);
    const group = (access: CalendarAccess, status: 'scheduled' | 'cancelled' = 'scheduled') =>
      quickViewActions(session('m-sarah', { type: 'group', status, clients: undefined }), access);
    expect(group(owner)).toEqual({
      open: true,
      move: false,
      change: true,
      clientProfile: false,
      assign: null,
      cancel: false,
      cancelClass: true,
      copyLink: true,
    });
    expect(group(owner, 'cancelled').change).toBe(false);
    expect(group(trainer).change).toBe(false);
  });
});

describe('F023 the quick view offers the trainer dialog', () => {
  const series = {
    id: 'r1',
    weekday: 'TU' as const,
    localStartTime: '18:00',
    occurrenceDate: '2026-10-06',
    changedFields: [],
  };
  const group = (trainerId: string | undefined, overrides = {}) =>
    session(trainerId, { type: 'group', clients: undefined, ...overrides });

  it('AC1: a class date without a trainer has Trainer toewijzen', () => {
    expect(quickViewActions(group(undefined), owner).assign).toBe('assign');
  });

  it('AC2: a class date of a series that has a trainer has Trainer vervangen; a one-off one has neither', () => {
    expect(quickViewActions(group('m-sarah', { series }), owner).assign).toBe('substitute');
    expect(quickViewActions(group('m-sarah'), owner).assign).toBeNull();
  });

  it('AC8: a private session has Trainer wijzigen, with or without a trainer', () => {
    expect(quickViewActions(session('m-sarah'), owner).assign).toBe('change');
    expect(quickViewActions(session(undefined), owner).assign).toBe('change');
  });

  it('AC12: a Trainer has none, and nobody has one on a cancelled block', () => {
    expect(quickViewActions(group(undefined), trainer).assign).toBeNull();
    expect(quickViewActions(session('m-sarah', { status: 'cancelled' }), owner).assign).toBeNull();
  });
});

describe('F026 AC5: the quick view offers the cancel actions by role', () => {
  const group = (trainerId: string | undefined, overrides = {}) =>
    session(trainerId, { type: 'group', clients: undefined, ...overrides });

  it('the Owner has Annuleren on any private session and Les annuleren on a class date', () => {
    expect(quickViewActions(session('m-sarah'), owner)).toMatchObject({
      cancel: true,
      cancelClass: false,
    });
    expect(quickViewActions(group('m-sarah'), owner)).toMatchObject({
      cancel: false,
      cancelClass: true,
    });
  });

  it('a Trainer has Annuleren on their own private session only, and never Les annuleren', () => {
    expect(quickViewActions(session('m-sarah'), trainer).cancel).toBe(true);
    expect(quickViewActions(session('m-tom'), trainer).cancel).toBe(false);
    expect(quickViewActions(session(undefined), trainer).cancel).toBe(false);
    expect(quickViewActions(group('m-sarah'), trainer).cancelClass).toBe(false);
  });

  it('a cancelled block has neither', () => {
    expect(quickViewActions(session('m-sarah', { status: 'cancelled' }), owner)).toMatchObject({
      cancel: false,
    });
    expect(quickViewActions(group('m-sarah', { status: 'cancelled' }), owner)).toMatchObject({
      cancelClass: false,
    });
  });
});

describe('F037 AC8 (WC-05): the quick view offers Boekingslink kopiëren', () => {
  const group = (trainerId: string | undefined, overrides = {}) =>
    session(trainerId, { type: 'group', clients: undefined, ...overrides });

  it('the Owner has it on a class date that lies ahead, and a Trainer too, also on a colleague’s', () => {
    expect(quickViewActions(group('m-sarah'), owner).copyLink).toBe(true);
    expect(quickViewActions(group('m-sarah'), trainer).copyLink).toBe(true);
    expect(quickViewActions(group('m-tom'), trainer).copyLink).toBe(true);
    expect(quickViewActions(group(undefined), trainer).copyLink).toBe(true);
  });

  it('never on a private session', () => {
    expect(quickViewActions(session('m-sarah'), owner).copyLink).toBe(false);
    expect(quickViewActions(session('m-sarah'), trainer).copyLink).toBe(false);
  });

  it('never on a cancelled class date, nor on one that has begun', () => {
    expect(quickViewActions(group('m-sarah', { status: 'cancelled' }), owner).copyLink).toBe(false);
    expect(
      quickViewActions(group('m-sarah', { startsAt: '2026-11-20T09:00:00.000Z' }), owner).copyLink,
    ).toBe(false);
    expect(
      quickViewActions(group('m-sarah', { startsAt: '2026-11-18T17:00:00.000Z' }), owner).copyLink,
    ).toBe(false);
  });

  it('only for a person who has booking_link.copy', () => {
    expect(quickViewActions(group('m-sarah'), { ...trainer, canCopyLink: false }).copyLink).toBe(
      false,
    );
  });
});
