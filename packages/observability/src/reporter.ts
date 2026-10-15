import {
  createStackParser,
  createTransport,
  linkedErrorsIntegration,
  Scope,
  winterCGRequestToRequestData,
} from '@sentry/core';
import { nodeStackLineParser, ServerRuntimeClient } from '@sentry/core/server';
import { type EnvironmentVariables, readErrorReportingConfig } from './config.ts';
import { scrubBreadcrumb, scrubEvent } from './scrub.ts';
import { createFetchTransport, type ErrorTransport } from './transport.ts';

export interface ErrorContext {
  /** The incoming request. Only its method, URL path and allowlisted headers are sent. */
  request?: Request;
  /** The route template, e.g. `/v1/clients/:clientId`; never the real path. */
  route?: string;
  /** Defaults to `error`. A `warning` is for something that went wrong without failing the request. */
  level?: 'error' | 'warning';
}

export interface ErrorReporter {
  /** False without a DSN: then nothing is captured and nothing leaves the process. */
  readonly enabled: boolean;
  /** Reports an unhandled error. Never throws. */
  captureError(error: unknown, context?: ErrorContext): void;
  /** Waits until every captured error is sent, at most 2 s. False on timeout. */
  flush(): Promise<boolean>;
}

export interface ErrorReporterOptions {
  /** Defaults to `process.env` (`SENTRY_DSN`, `RAILWAY_*`). */
  env?: EnvironmentVariables;
  /** Tests pass `createCaptureTransport()`; production posts to Sentry. */
  transport?: ErrorTransport;
}

/** How long `flush()` waits, so a slow Sentry never holds up an exit for long. */
const FLUSH_TIMEOUT_MS = 2_000;

const DISABLED: ErrorReporter = {
  enabled: false,
  captureError: () => {},
  flush: () => Promise.resolve(true),
};

/**
 * Error reporting for a server runtime (the API inside Next.js, the cron job). Its own Sentry
 * client, not the global one: no auto-instrumentation, no tracing, no session replay and no
 * process-wide handlers. Every event goes through the scrubber before it is sent.
 */
export function createErrorReporter(options: ErrorReporterOptions = {}): ErrorReporter {
  const config = readErrorReportingConfig(options.env);
  if (!config.dsn) return DISABLED;
  const transport = options.transport ?? createFetchTransport();
  const client = new ServerRuntimeClient({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release,
    platform: 'node',
    runtime: { name: 'node', version: process.version },
    sendDefaultPii: false,
    sendClientReports: false,
    integrations: [linkedErrorsIntegration()],
    stackParser: createStackParser(nodeStackLineParser()),
    transport: (transportOptions) =>
      createTransport(transportOptions, ({ body }) =>
        transport.send({ url: transportOptions.url, body }),
      ),
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
  });
  const scope = new Scope();
  scope.setClient(client);
  client.init();

  return {
    enabled: true,
    captureError: (error, context = {}) => {
      const eventScope = scope.clone();
      if (context.level) eventScope.setLevel(context.level);
      const { request, route } = context;
      if (route) {
        eventScope.setTag('route', route);
        eventScope.setTransactionName(request ? `${request.method} ${route}` : route);
      }
      if (request) {
        const requestData = winterCGRequestToRequestData(request);
        eventScope.addEventProcessor((event) => ({ ...event, request: requestData }));
      }
      eventScope.captureException(error);
    },
    flush: async () => client.flush(FLUSH_TIMEOUT_MS),
  };
}
