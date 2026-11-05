import { describe, expect, it } from 'vitest';
import {
  CAPABILITIES,
  type Capability,
  capabilitiesOf,
  hasCapability,
  ROLES,
  rolesWith,
} from './matrix.ts';

const TRAINER_CAPABILITIES: readonly Capability[] = [
  'trainers.view',
  'clients.view',
  'clients.manage',
  'location.read',
  'session.private.manage.own',
];

describe('F004 permission matrix', () => {
  it('AC1: Owner has every capability, Trainer only trainers.view, clients.view, clients.manage, location.read and session.private.manage.own', () => {
    expect(ROLES).toEqual(['owner', 'trainer']);
    expect(CAPABILITIES).toEqual([
      'workspace.manage',
      'team.view',
      'team.manage',
      'trainers.view',
      'clients.view',
      'clients.manage',
      'location.read',
      'settings.manage',
      'team.invite',
      'session.private.manage.own',
      'session.private.manage.any',
    ]);
    expect(capabilitiesOf('owner')).toEqual(CAPABILITIES);
    expect(capabilitiesOf('trainer')).toEqual(TRAINER_CAPABILITIES);
  });

  it.each(ROLES.flatMap((role) => CAPABILITIES.map((capability) => [role, capability] as const)))(
    '%s x %s agrees with the capability list',
    (role, capability) => {
      expect(hasCapability(role, capability)).toBe(capabilitiesOf(role).includes(capability));
    },
  );

  it('names the roles that hold a capability, in role order', () => {
    expect(rolesWith('team.manage')).toEqual(['owner']);
    expect(rolesWith('workspace.manage')).toEqual(['owner']);
    expect(rolesWith('clients.view')).toEqual(['owner', 'trainer']);
    expect(rolesWith('trainers.view')).toEqual(['owner', 'trainer']);
    // F015: every team member reads the workspace's location, only the Owner changes it.
    expect(rolesWith('location.read')).toEqual(['owner', 'trainer']);
    expect(rolesWith('settings.manage')).toEqual(['owner']);
    // F011: only the Owner invites a trainer, sends the invitation again or withdraws it.
    expect(rolesWith('team.invite')).toEqual(['owner']);
    // F020: a Trainer plans their own private sessions, only the Owner plans for any trainer.
    expect(rolesWith('session.private.manage.own')).toEqual(['owner', 'trainer']);
    expect(rolesWith('session.private.manage.any')).toEqual(['owner']);
  });

  it('AC9: has no admin role', () => {
    expect(ROLES as readonly string[]).not.toContain('admin');
  });

  it('hands out a list that a caller can not use to change the matrix', () => {
    const owner = capabilitiesOf('owner') as Capability[];
    owner.pop();
    expect(capabilitiesOf('owner')).toEqual(CAPABILITIES);
  });
});
