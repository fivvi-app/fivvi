import { OpenAPIHono } from '@hono/zod-openapi';
import { Hono } from 'hono';
import { toValidationError } from './errors.ts';
import { registerHello } from './routes/hello.ts';

/** Where apps/web mounts the API. Contract paths don't include it, so the API can move later. */
export const API_BASE_PATH = '/api';

export function createApp(): OpenAPIHono {
  const app = new OpenAPIHono({
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.json(toValidationError(result.error), 400);
      }
      return undefined;
    },
  });
  registerHello(app);
  return app;
}

/** A fetch handler serving the API under `basePath`, for the Next.js catch-all route. */
export function createApiHandler(
  basePath: string = API_BASE_PATH,
): (request: Request) => Response | Promise<Response> {
  const root = new Hono().basePath(basePath).route('/', createApp());
  return (request) => root.fetch(request);
}
