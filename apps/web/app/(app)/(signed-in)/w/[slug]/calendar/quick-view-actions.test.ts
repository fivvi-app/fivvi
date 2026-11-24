import { describe, expect, it } from 'vitest';
import type { CalendarAccess } from './quick-view';
import { quickViewActions } from './quick-view-actions';

// F014 AC6 and AC12 (spec #458, ticket #529): what the quick view of a block offers each role. A
// Trainer has `clients.view`, and still has *Openen* only on a colleague's session.
const owner: CalendarAccess = {
  canMoveAny: true,
  canMoveOwn: true,
  canChangeClasses: true,
  canSeeClients: true,
  canManageCalendar: true,
  canAssign: true,
  teamMemberId: 'm-john',
};
const trainer: CalendarAccess = {
  canMoveAny: false,
  canMoveOwn: true,
  canChangeClasses: false,
  canSeeClients: true,
  canManageCalendar: false,
  canAssign: false,
  teamMemberId: 'm-sarah',
};
const session = (trainerId: string | undefined, overrides = {}) => ({
  type: 'private' as const,
  status: 'scheduled' as const,
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
    });
  });

  it('gives a Trainer the actions on their own session only', () => {
    expect(quickViewActions(session('m-sarah'), trainer)).toEqual({
      open: true,
      move: true,
      change: false,
      clientProfile: true,
      assign: null,
    });
  });

  it('gives a Trainer Openen only on a colleague’s session, and on one without a trainer', () => {
    const only = { open: true, move: false, change: false, clientProfile: false, assign: null };
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
