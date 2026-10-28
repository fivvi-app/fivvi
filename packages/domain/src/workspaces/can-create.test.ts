import { describe, expect, it } from 'vitest';
import { canCreateWorkspace, type SignUpAllowlist } from './can-create.ts';

// The allowlist is F001's (`parseSignUpAllowlist` of @fivvi/auth); the rule only needs its shape.
const allowlist = (...entries: string[]): SignUpAllowlist => ({
  allows: (email) => entries.includes(email.trim().toLowerCase()),
});

describe('F002 who may create a workspace', () => {
  const pilot = allowlist('pilot@example.com');

  it('AC5: an allowlisted account without a team role may', () => {
    expect(
      canCreateWorkspace({
        email: 'pilot@example.com',
        signUpAllowlist: pilot,
        hasTeamRole: false,
      }),
    ).toBe(true);
  });

  it('AC5: an account that is not allowlisted may not, whatever its roles', () => {
    expect(
      canCreateWorkspace({
        email: 'client@example.com',
        signUpAllowlist: pilot,
        hasTeamRole: false,
      }),
    ).toBe(false);
    expect(
      canCreateWorkspace({
        email: 'client@example.com',
        signUpAllowlist: pilot,
        hasTeamRole: true,
      }),
    ).toBe(false);
  });

  it('AC4: an allowlisted account with a team role in any workspace may not', () => {
    expect(
      canCreateWorkspace({ email: 'pilot@example.com', signUpAllowlist: pilot, hasTeamRole: true }),
    ).toBe(false);
  });

  it('AC5: nobody may while sign-up is closed', () => {
    expect(
      canCreateWorkspace({
        email: 'pilot@example.com',
        signUpAllowlist: allowlist(),
        hasTeamRole: false,
      }),
    ).toBe(false);
  });

  it('asks the allowlist with the address as it is, so its own case rules apply', () => {
    expect(
      canCreateWorkspace({
        email: ' Pilot@Example.com ',
        signUpAllowlist: pilot,
        hasTeamRole: false,
      }),
    ).toBe(true);
  });
});
