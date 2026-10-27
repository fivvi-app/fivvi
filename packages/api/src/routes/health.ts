import { type OpenAPIHono, z } from '@hono/zod-openapi';
import { defineRoute } from '../access.ts';
import type { ApiDependencies } from '../dependencies.ts';

/** A ping slower than this counts as a failure, so the health check itself never hangs. */
export const HEALTH_CHECK_TIMEOUT_MS = 3_000;

const CheckStatusSchema = z.enum(['ok', 'unavailable']).openapi('HealthCheckStatus');

export const HealthResponseSchema = z
  .object({
    status: CheckStatusSchema.openapi({ description: '`ok` only when every check is `ok`.' }),
    checks: z.object({
      database: CheckStatusSchema.openapi({ description: 'Postgres answered a ping.' }),
    }),
  })
  .openapi('HealthResponse', {
    description: 'Liveness of the API and its dependencies. Contains no error details.',
  });

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

const healthRoute = defineRoute(
  {
    method: 'get',
    path: '/v1/health',
    operationId: 'getHealth',
    tags: ['health'],
    summary: 'Health check',
    description:
      'Pings the database. Railway uses it as the deploy health check, so a deployment that ' +
      "can't reach Postgres never receives traffic.",
    responses: {
      200: {
        description: 'The API and all its dependencies are healthy.',
        content: { 'application/json': { schema: HealthResponseSchema } },
      },
      503: {
        description: 'A dependency is unavailable.',
        content: { 'application/json': { schema: HealthResponseSchema } },
      },
    },
  },
  { type: 'public' },
);

async function withTimeout(check: () => Promise<void>, timeoutMs: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs} ms`)), timeoutMs);
  });
  try {
    await Promise.race([check(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export function registerHealth(app: OpenAPIHono, dependencies: ApiDependencies) {
  app.openapi(healthRoute, async (c) => {
    c.header('Cache-Control', 'no-store');
    try {
      await withTimeout(dependencies.pingDatabase, HEALTH_CHECK_TIMEOUT_MS);
    } catch (error) {
      // Server log only: the response never says why, so it can't leak connection details.
      console.error('Health check: database unavailable:', (error as Error).message);
      return c.json({ status: 'unavailable', checks: { database: 'unavailable' } } as const, 503);
    }
    return c.json({ status: 'ok', checks: { database: 'ok' } } as const, 200);
  });
}
