import { OpenAPIHono } from '@hono/zod-openapi';
import { Hono } from 'hono';
import { type ApiDependencies, NO_DEPENDENCIES } from './dependencies.ts';
import { toValidationError } from './errors.ts';
import { registerHealth } from './routes/health.ts';
import { registerHello } from './routes/hello.ts';

/** Where apps/web mounts the API. Contract paths don't include it, so the API can move later. */
export const API_BASE_PATH = '/api';

export function createApp(dependencies: ApiDependencies = NO_DEPENDENCIES): OpenAPIHono {
  const app = new OpenAPIHono({
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.json(toValidationError(result.error), 400);
      }
      return undefined;
    },
  });
  registerHealth(app, dependencies);
  registerHello(app);
  return app;
}

/** A fetch handler serving the API under `basePath`, for the Next.js catch-all route. */
export function createApiHandler(
  dependencies: ApiDependencies = NO_DEPENDENCIES,
  basePath: string = API_BASE_PATH,
): (request: Request) => Response | Promise<Response> {
  const root = new Hono().basePath(basePath).route('/', createApp(dependencies));
  return (request) => root.fetch(request);
}
