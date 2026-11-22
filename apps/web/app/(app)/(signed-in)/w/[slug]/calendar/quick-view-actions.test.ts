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
  teamMemberId: 'm-john',
};
const trainer: CalendarAccess = {
  canMoveAny: false,
  canMoveOwn: true,
  canChangeClasses: false,
  canSeeClients: true,
  canManageCalendar: false,
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
    });
  });

  it('gives a Trainer the actions on their own session only', () => {
    expect(quickViewActions(session('m-sarah'), trainer)).toEqual({
      open: true,
      move: true,
      change: false,
      clientProfile: true,
    });
  });

  it('gives a Trainer Openen only on a colleague’s session, and on one without a trainer', () => {
    const only = { open: true, move: false, change: false, clientProfile: false };
    expect(quickViewActions(session('m-tom'), trainer)).toEqual(only);
    expect(quickViewActions(session(undefined), trainer)).toEqual(only);
  });

  it('has no Verplaatsen on a cancelled session, and Wijzigen only on a class date for who manages classes', () => {
    expect(quickViewActions(session('m-sarah', { status: 'cancelled' }), owner).move).toBe(false);
    const group = (access: CalendarAccess, status: 'scheduled' | 'cancelled' = 'scheduled') =>
      quickViewActions(session('m-sarah', { type: 'group', status, clients: undefined }), access);
    expect(group(owner)).toEqual({ open: true, move: false, change: true, clientProfile: false });
    expect(group(owner, 'cancelled').change).toBe(false);
    expect(group(trainer).change).toBe(false);
  });
});
