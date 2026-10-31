import { describe, expect, it } from 'vitest';
import { canChangeRole, canRemoveTeamMember, keepsAnOwner } from './last-owner.ts';

const john = { id: 'john', role: 'owner' } as const;
const mike = { id: 'mike', role: 'owner' } as const;
const sarah = { id: 'sarah', role: 'trainer' } as const;

describe('F003 AC7: a workspace keeps at least one Owner', () => {
  it('holds for a team with an Owner and fails for one without', () => {
    expect(keepsAnOwner([john, sarah])).toBe(true);
    expect(keepsAnOwner([sarah])).toBe(false);
    expect(keepsAnOwner([])).toBe(false);
  });

  it('lets a Trainer go whatever the Owners are', () => {
    expect(canRemoveTeamMember([john, sarah], 'sarah')).toBe(true);
  });

  it('lets an Owner go while another Owner stays', () => {
    expect(canRemoveTeamMember([john, mike, sarah], 'john')).toBe(true);
  });

  it('refuses to remove the only Owner', () => {
    expect(canRemoveTeamMember([john, sarah], 'john')).toBe(false);
    expect(canRemoveTeamMember([john], 'john')).toBe(false);
  });

  it('refuses to remove a team member that is not on the team', () => {
    expect(canRemoveTeamMember([john, sarah], 'unknown')).toBe(false);
  });
});

describe('F004 AC5: the last Owner can’t become a Trainer', () => {
  it('AC5: the only Owner can’t become a Trainer', () => {
    expect(canChangeRole([john, sarah], 'john', 'trainer')).toBe(false);
    expect(canChangeRole([john], 'john', 'trainer')).toBe(false);
  });

  it('lets an Owner become a Trainer while another Owner stays', () => {
    expect(canChangeRole([john, mike, sarah], 'john', 'trainer')).toBe(true);
  });

  it('lets a Trainer become an Owner, and an Owner stay an Owner', () => {
    expect(canChangeRole([john, sarah], 'sarah', 'owner')).toBe(true);
    expect(canChangeRole([john], 'john', 'owner')).toBe(true);
  });

  it('lets a Trainer stay a Trainer whatever the Owners are', () => {
    expect(canChangeRole([john, sarah], 'sarah', 'trainer')).toBe(true);
  });

  it('refuses a team member that is not on the team', () => {
    expect(canChangeRole([john, sarah], 'unknown', 'owner')).toBe(false);
  });

  it('judges the whole team: of two Owners, only the first demotion passes', () => {
    expect(canChangeRole([john, mike], 'john', 'trainer')).toBe(true);
    const afterFirst = [{ id: 'john', role: 'trainer' } as const, mike];
    expect(canChangeRole(afterFirst, 'mike', 'trainer')).toBe(false);
  });
});
