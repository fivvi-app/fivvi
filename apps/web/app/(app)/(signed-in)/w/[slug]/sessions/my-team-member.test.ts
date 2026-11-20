import { describe, expect, it } from 'vitest';
import { myTeamMemberId } from './my-team-member';

const team = [
  { id: 'm1', email: 'sarah@example.com' },
  { id: 'm2', email: 'John@Example.com' },
];

describe('F023 AC6: the signed-in person among the team', () => {
  it('finds them by email address, whatever the case', () => {
    expect(myTeamMemberId(team, 'john@example.com')).toBe('m2');
    expect(myTeamMemberId(team, 'SARAH@example.com')).toBe('m1');
  });

  it('is null for a person who is not on the team', () => {
    expect(myTeamMemberId(team, 'tom@example.com')).toBeNull();
    expect(myTeamMemberId([], 'tom@example.com')).toBeNull();
  });
});
