import { createRailwayContext, project } from 'railway/iac';
import { describe, expect, it } from 'vitest';
import program from '../../../.railway/railway.ts';
import { CRON_MONITOR } from '../src/monitor.ts';

// E012 AC1: the Railway configuration (`.railway/railway.ts`) schedules the cron service.

interface ServiceNode {
  name: string;
  deploy?: { cronSchedule?: string; restartPolicyType?: string };
  variables?: Record<string, unknown>;
}

async function services(environment: string): Promise<Record<string, ServiceNode>> {
  const definition = await program(createRailwayContext({ environment }), project);
  const nodes = definition.resources as unknown as (ServiceNode & { type: string })[];
  return Object.fromEntries(
    nodes.filter((node) => node.type === 'service').map((n) => [n.name, n]),
  );
}

describe('E012 the cron schedule in .railway/railway.ts', () => {
  it.each(['production', 'development'])('AC1: cron every 5 minutes in %s', async (environment) => {
    const { cron } = await services(environment);

    expect(cron?.deploy?.cronSchedule).toBe('*/5 * * * *');
    // Railway starts the job and expects it to exit.
    expect(cron?.deploy?.restartPolicyType).toBe('NEVER');
  });

  it('AC1: only production and development are configured, so a PR environment never gets its own schedule', async () => {
    for (const environment of ['pr-499', 'staging', '']) {
      await expect(services(environment), environment).rejects.toThrow(
        'production or development only',
      );
    }
  });

  it('AC10: the Sentry monitor expects the schedule that Railway runs', async () => {
    const { cron } = await services('production');

    expect(CRON_MONITOR.crontab).toBe(cron?.deploy?.cronSchedule);
    // Railway skips a run while the previous one is going: a run longer than the interval is a miss.
    expect(CRON_MONITOR.maxRuntime).toBeLessThan(5);
  });

  it('AC7: the cron connects as fivvi_cron and is not given the privileged DATABASE_URL', async () => {
    const { cron, web } = await services('production');

    expect(Object.keys(cron?.variables ?? {})).not.toContain('DATABASE_URL');
    expect(JSON.stringify(cron?.variables?.CRON_DATABASE_URL)).toContain(
      'postgresql://fivvi_cron:',
    );
    // The password is set once, on `web`, where the release step reads it.
    expect(web?.variables?.CRON_DATABASE_PASSWORD).toEqual({ type: 'preserve' });
    expect(JSON.stringify(cron?.variables?.CRON_DATABASE_PASSWORD)).toMatch(
      /\$\{\{web\.CRON_DATABASE_PASSWORD\}\}/,
    );
  });
});
