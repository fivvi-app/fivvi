import { describe, expect, it } from 'vitest';
import { reportedRunMs } from './run-main.ts';

describe('E012 AC9: the duration of a run, as the process reports it', () => {
  it('reads the milliseconds from the finish line', () => {
    const stdout = 'Cron started: run x.\nDatabase reachable.\nCron finished in 412 ms.\n';

    expect(reportedRunMs(stdout)).toBe(412);
  });

  it('reports a run over 10 seconds as over 10 seconds, whatever the start-up cost', () => {
    expect(reportedRunMs('Cron finished in 10400 ms.\n')).toBeGreaterThanOrEqual(10_000);
  });

  it('throws when the run did not finish, so a missing line never passes as fast', () => {
    expect(() => reportedRunMs('Cron started: run x.\n')).toThrow(/finish line/);
  });
});
