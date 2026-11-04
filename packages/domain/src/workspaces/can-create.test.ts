import { describe, expect, it } from 'vitest';
import { canCreateWorkspace, type SignUpAllowlist } from './can-create.ts';

// The allowlist is F001's (`parseSignUpAllowlist` of @fivvi/auth); the rule only needs its shape.
const allowlist = (...entries: string[]): SignUpAllowlist => ({
  allows: (email) => entries.includes(email.trim().toLowerCase()),
});

describe('F002 / F012 who may create a workspace', () => {
  const pilot = allowlist('pilot@example.com');

  it('AC5: an allowlisted account may', () => {
    expect(canCreateWorkspace({ email: 'pilot@example.com', signUpAllowlist: pilot })).toBe(true);
  });

  it('AC5: an account that is not allowlisted may not', () => {
    expect(canCreateWorkspace({ email: 'client@example.com', signUpAllowlist: pilot })).toBe(false);
  });

  it('F012 AC8: the rule takes no team role into account: an allowlisted account may create another workspace', () => {
    // The input has no "has a team role" field any more (F012): whoever owns a workspace
    // already is judged by the allowlist alone, like an account with none.
    expect(
      canCreateWorkspace({
        email: 'pilot@example.com',
        signUpAllowlist: pilot,
        hasTeamRole: true,
      } as Parameters<typeof canCreateWorkspace>[0]),
    ).toBe(true);
  });

  it('AC5: nobody may while sign-up is closed', () => {
    expect(canCreateWorkspace({ email: 'pilot@example.com', signUpAllowlist: allowlist() })).toBe(
      false,
    );
  });

  it('asks the allowlist with the address as it is, so its own case rules apply', () => {
    expect(canCreateWorkspace({ email: ' Pilot@Example.com ', signUpAllowlist: pilot })).toBe(true);
  });
});
