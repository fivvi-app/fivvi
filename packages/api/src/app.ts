import { OpenAPIHono } from '@hono/zod-openapi';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { type ApiDependencies, NO_DEPENDENCIES } from './dependencies.ts';
import { INTERNAL_SERVER_ERROR, toValidationError } from './errors.ts';
import { registerHealth } from './routes/health.ts';
import { registerHello } from './routes/hello.ts';
import { registerMe } from './routes/me.ts';

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
  // After the response is ready, so a route's product events leave before the request ends.
  app.use(async (_c, next) => {
    await next();
    await dependencies.productEvents.flush();
  });
  app.onError((error, c) => {
    if (error instanceof HTTPException) return error.getResponse();
    // The same generic 500 as Hono's default: no stack trace, no internal message.
    console.error('Unhandled API error:', error);
    dependencies.errorReporter.captureError(error, { request: c.req.raw, route: c.req.routePath });
    return c.text(INTERNAL_SERVER_ERROR, 500);
  });
  registerHealth(app, dependencies);
  registerHello(app, dependencies);
  registerMe(app, dependencies);
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
