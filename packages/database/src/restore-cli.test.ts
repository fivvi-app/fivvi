import { describe, expect, it } from 'vitest';
import { parseTime, runRestore } from './restore-cli.ts';
import { SafeError } from './safe-error.ts';

describe('E016 the time of the restore helper', () => {
  it('AC2: reads an RFC 3339 time with Z or an offset', () => {
    expect(parseTime('2026-11-10T09:00:00Z').toISOString()).toBe('2026-11-10T09:00:00.000Z');
    expect(parseTime('2026-11-10T10:00:00+01:00').toISOString()).toBe('2026-11-10T09:00:00.000Z');
    expect(parseTime('2026-11-10T09:00:00.250-00:30').toISOString()).toBe(
      '2026-11-10T09:30:00.250Z',
    );
  });

  it('AC2: refuses a time without an offset, which would be read in local time', () => {
    for (const value of ['2026-11-10T09:00:00', '2026-11-10T09:00', '2026-11-10T09:00:00+0100']) {
      expect(() => parseTime(value)).toThrow('RFC 3339');
    }
  });

  it('AC2: refuses a missing, a date-only and an impossible time', () => {
    expect(() => parseTime(undefined)).toThrow('RFC 3339');
    expect(() => parseTime('2026-11-10')).toThrow('RFC 3339');
    expect(() => parseTime('2026-13-01T09:00:00Z')).toThrow('not a valid time');
  });
});

describe('E016 the errors of the restore helper', () => {
  const run = async (argv: string[], open: () => never) => {
    const lines: string[] = [];
    const code = await runRestore(argv, { open, out: (line) => lines.push(line) });
    return { code, output: lines.join('\n') };
  };

  it('AC2: prints the message of a safe error', async () => {
    const result = await run(['markers', 'check', '--database-url-env', 'SOME_URL'], () => {
      throw new SafeError('SOME_URL is not set.');
    });

    expect(result.code).toBe(2);
    expect(result.output).toContain('SOME_URL is not set.');
  });

  it('AC4: hides the message of any other error, which could hold a value', async () => {
    const result = await run(['markers', 'check', '--database-url-env', 'SOME_URL'], () => {
      throw new Error('duplicate key value (zzqsecret-gym-name)');
    });

    expect(result.code).toBe(2);
    expect(result.output).toContain('the restore helper failed');
    expect(result.output).not.toContain('zzqsecret');
  });
});
