import {
  createStackParser,
  createTransport,
  linkedErrorsIntegration,
  type RequestEventData,
  Scope,
  winterCGRequestToRequestData,
} from '@sentry/core';
import { nodeStackLineParser, ServerRuntimeClient } from '@sentry/core/server';
import { type EnvironmentVariables, readErrorReportingConfig } from './config.ts';
import { NO_DATA_COLLECTION, scrubBreadcrumb, scrubEvent } from './scrub.ts';
import { createFetchTransport, type ErrorTransport } from './transport.ts';

/** A request as a framework describes it, e.g. Next.js in `onRequestError`. */
export interface RequestDetails {
  method: string;
  /** The URL or the path; the query string is never sent. */
  url: string;
  headers?: Readonly<Record<string, string | string[] | undefined>>;
}

export interface ErrorContext {
  /** The incoming request. Only its method, URL path and allowlisted headers are sent. */
  request?: Request | RequestDetails;
  /** The route template, e.g. `/v1/clients/:clientId`; never the real path. */
  route?: string;
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
    dataCollection: NO_DATA_COLLECTION,
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
      const { request, route } = context;
      if (route) {
        eventScope.setTag('route', route);
        eventScope.setTransactionName(request ? `${request.method} ${route}` : route);
      }
      if (request) {
        const requestData = toRequestData(request);
        eventScope.addEventProcessor((event) => ({ ...event, request: requestData }));
      }
      eventScope.captureException(error);
    },
    flush: async () => client.flush(FLUSH_TIMEOUT_MS),
  };
}

function toRequestData(request: Request | RequestDetails): RequestEventData {
  if (request instanceof Request) return winterCGRequestToRequestData(request);
  const headers = Object.entries(request.headers ?? {}).flatMap(([name, value]) =>
    value === undefined ? [] : [[name, Array.isArray(value) ? value.join(', ') : value] as const],
  );
  return { method: request.method, url: request.url, headers: Object.fromEntries(headers) };
}
