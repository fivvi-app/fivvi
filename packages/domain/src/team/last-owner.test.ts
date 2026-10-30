import { describe, expect, it } from 'vitest';
import { canRemoveTeamMember, keepsAnOwner } from './last-owner.ts';

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
