import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadsCode } from '../test/loads-code.ts';
import { parseSignUpAllowlist } from './allowlist.ts';

describe('F001 AC9 sign-up allowlist', () => {
  it('allows an exact address, whatever its case', () => {
    const allowlist = parseSignUpAllowlist('Pilot@Gym.test');

    expect(allowlist.allows('pilot@gym.test')).toBe(true);
    expect(allowlist.allows('PILOT@gym.test')).toBe(true);
    expect(allowlist.allows('other@gym.test')).toBe(false);
  });

  it('allows every address of an @domain entry, but not of its subdomains or look-alikes', () => {
    const allowlist = parseSignUpAllowlist('@gym.test');

    expect(allowlist.allows('anyone@gym.test')).toBe(true);
    expect(allowlist.allows('anyone@GYM.test')).toBe(true);
    expect(allowlist.allows('anyone@sub.gym.test')).toBe(false);
    expect(allowlist.allows('anyone@notgym.test')).toBe(false);
    expect(allowlist.allows('anyone@gym.test.evil.test')).toBe(false);
    expect(allowlist.allows('gym.test')).toBe(false);
  });

  it('reads a comma-separated list of both kinds, ignoring spaces and empty entries', () => {
    const allowlist = parseSignUpAllowlist(' pilot@gym.test , @example.com,, ');

    expect(allowlist.allows('pilot@gym.test')).toBe(true);
    expect(allowlist.allows('x@example.com')).toBe(true);
    expect(allowlist.allows('x@gym.test')).toBe(false);
  });

  it.each([undefined, '', '  ', ' , '])('allows nobody for %j: sign-up stays closed', (value) => {
    const allowlist = parseSignUpAllowlist(value);

    expect(allowlist.allows('owner@example.com')).toBe(false);
  });

  it.each(['example.com', '*@example.com', 'a@', '@', 'a b@example.com', 'a@b@example.com'])(
    'rejects the malformed entry %j without echoing it',
    (entry) => {
      let message = '';
      try {
        parseSignUpAllowlist(`pilot@gym.test,${entry}`);
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toMatch(/SIGN_UP_ALLOWED_EMAILS entry 2/);
      expect(message).not.toContain(entry);
    },
  );
});

describe('F001 AC9 sign-up allowlist without the sign-in code (#200)', () => {
  it('imports nothing at run time, so the start-up check never waits for Better Auth', () => {
    const source = readFileSync(new URL('./allowlist.ts', import.meta.url), 'utf8');

    expect(loadsCode(source)).toBe(false);
  });

  it.each([
    "import { x } from './x';",
    "import './x';",
    "import'./x';",
    "import{x}from'./x';",
    "const x = await import('./x');",
    "const x = require('./x');",
    "export { x } from './x';",
  ])('the guard sees the run-time load %j', (line) => {
    expect(loadsCode(line)).toBe(true);
  });

  it.each([
    "import type { X } from './x';",
    "// import('./x') in a comment\nexport const a = 1;",
    '/* require("./x") */\nexport const a = 1;',
  ])('the guard ignores type imports and comments %j', (source) => {
    expect(loadsCode(source)).toBe(false);
  });
});
