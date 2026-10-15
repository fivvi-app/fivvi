import type { ErrorReporter } from './reporter.ts';

/** The request as Next.js passes it to `onRequestError` (`instrumentation.ts`). */
export interface ErroredRequest {
  readonly path: string;
  readonly method: string;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
}

/** Where the error happened; `routePath` is the route template, e.g. `/clients/[clientId]`. */
export interface RequestErrorContext {
  readonly routePath: string;
}

export type RequestErrorHandler = (
  error: unknown,
  request: ErroredRequest,
  context: RequestErrorContext,
) => void;

/**
 * Next.js's `onRequestError` hook for the web server: reports errors thrown while rendering a
 * page (server components, server actions) and in route handlers outside the API. API errors
 * never get here: the API answers them with a 500 itself and reports them (`packages/api`).
 */
export function createRequestErrorHandler(reporter: ErrorReporter): RequestErrorHandler {
  return (error, request, context) => {
    reporter.captureError(error, {
      request: { method: request.method, url: request.path, headers: request.headers },
      route: context.routePath,
    });
  };
}
