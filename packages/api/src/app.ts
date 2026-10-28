import { OpenAPIHono } from '@hono/zod-openapi';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { provideDependencies } from './access.ts';
import { type ApiDependencies, NO_DEPENDENCIES } from './dependencies.ts';
import {
  answerValidationFailure,
  ForbiddenSchema,
  INTERNAL_SERVER_ERROR,
  NotFoundSchema,
  NotSignedInSchema,
} from './errors.ts';
import { registerHealth } from './routes/health.ts';
import { registerHello } from './routes/hello.ts';
import { registerMe } from './routes/me.ts';
import { registerSignIn } from './routes/sign-in.ts';
import { registerWorkspaces } from './routes/workspaces.ts';

/** Where apps/web mounts the API. Contract paths don't include it, so the API can move later. */
export const API_BASE_PATH = '/api';

export function createApp(dependencies: ApiDependencies = NO_DEPENDENCIES): OpenAPIHono {
  const app = new OpenAPIHono({ defaultHook: answerValidationFailure });
  // Where the access middleware of every route finds the sign-in lookup (access.ts).
  app.use(provideDependencies(dependencies));
  // After the response is ready, so a route's product events leave before the request ends.
  app.use(async (_c, next) => {
    await next();
    await dependencies.productEvents.flush();
  });
  app.onError((error, c) => {
    if (error instanceof HTTPException) return error.getResponse();
    // The same generic 500 as Hono's default: no stack trace, no internal message. The log names
    // the error and nothing else, because a database error can quote an address; Sentry has the
    // scrubbed event.
    console.error('Unhandled API error:', error.name);
    dependencies.errorReporter.captureError(error, { request: c.req.raw, route: c.req.routePath });
    return c.text(INTERNAL_SERVER_ERROR, 500);
  });
  // How a request proves who it is: the web's sign-in session cookie, an app's bearer token.
  app.openAPIRegistry.registerComponent('securitySchemes', 'cookieAuth', {
    type: 'apiKey',
    in: 'cookie',
    name: 'better-auth.session_token',
    description:
      'The sign-in session cookie of the web (`__Secure-` prefixed over https). Set by the ' +
      'web’s own sign-in, not by this contract.',
  });
  app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    description:
      'The token of `POST /v1/sign-in/token`: a sign-in session. Ended by `POST /v1/sign-out`.',
  });
  // The refusals of the access a route declares (access.ts) are in the contract, whether or not a
  // route of the moment can give each of them.
  app.openAPIRegistry.register('NotSignedIn', NotSignedInSchema);
  app.openAPIRegistry.register('NotFound', NotFoundSchema);
  app.openAPIRegistry.register('Forbidden', ForbiddenSchema);
  registerHealth(app, dependencies);
  registerHello(app, dependencies);
  registerMe(app);
  registerSignIn(app, dependencies);
  registerWorkspaces(app);
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
