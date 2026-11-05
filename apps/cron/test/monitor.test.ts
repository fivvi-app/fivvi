import type { CronCheckIn, ServerErrorReporter } from '@fivvi/observability';
import { describe, expect, it, vi } from 'vitest';
import { CRON_MONITOR, isPreviewEnvironment, startMonitorCheckIn } from '../src/monitor.ts';

// E012 AC10: one Sentry cron monitor, checked in from production only.

function reporterWithSpy() {
  const finish = vi.fn();
  const startCheckIn = vi.fn((): CronCheckIn => ({ finish }));
  return { reporter: { startCheckIn } as unknown as ServerErrorReporter, startCheckIn, finish };
}

describe('E012 the cron monitor check-in', () => {
  it('AC10: production checks in to the monitor', () => {
    const { reporter, startCheckIn } = reporterWithSpy();

    startMonitorCheckIn(reporter, { RAILWAY_ENVIRONMENT_NAME: 'production' });

    expect(startCheckIn).toHaveBeenCalledWith(CRON_MONITOR);
  });

  it.each(['development', undefined, 'pr-499'])(
    'AC10: %s checks in nothing, so the free plan keeps its one monitor',
    (environment) => {
      const { reporter, startCheckIn } = reporterWithSpy();

      const checkIn = startMonitorCheckIn(reporter, { RAILWAY_ENVIRONMENT_NAME: environment });
      checkIn.finish('ok');

      expect(startCheckIn).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['pr-499', true],
    ['fivvi-pr-499', true],
    ['production', false],
    ['development', false],
    [undefined, false],
  ])('AC1: %s is a preview environment: %s', (environment, preview) => {
    expect(isPreviewEnvironment({ RAILWAY_ENVIRONMENT_NAME: environment })).toBe(preview);
  });
});
