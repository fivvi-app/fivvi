import {
  createStackParser,
  linkedErrorsIntegration,
  type RequestEventData,
  Scope,
  winterCGRequestToRequestData,
} from '@sentry/core';
import { nodeStackLineParser, ServerRuntimeClient } from '@sentry/core/server';
import { DISABLED_REPORTER, FLUSH_TIMEOUT_MS, sharedClientOptions } from './client-options.ts';
import { type EnvironmentVariables, readErrorReportingConfig } from './config.ts';
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
  /** Defaults to `error`. A `warning` is for something that went wrong without failing the request. */
  level?: 'error' | 'warning';
  /**
   * Tags to put on the event. Only the tags of the scrubber's allow-list are sent (`cron.task`,
   * `cron.run_id`); every other name is dropped, so a tag can never carry personal data.
   */
  tags?: Readonly<Record<string, string>>;
}

export interface ErrorReporter {
  /** False without a DSN: then nothing is captured and nothing leaves the process. */
  readonly enabled: boolean;
  /** Reports an unhandled error. Never throws. */
  captureError(error: unknown, context?: ErrorContext): void;
  /** Waits until every captured error is sent, at most 2 s. False on timeout. */
  flush(): Promise<boolean>;
}

/** A Sentry cron monitor (E012, AC10): the schedule a job is expected to check in on. */
export interface CronMonitor {
  /** The monitor's slug in Sentry. One monitor is free on every plan. */
  slug: string;
  /** The schedule as a crontab expression. */
  crontab: string;
  /** Minutes after the expected time before a missing check-in counts as missed. */
  checkinMargin?: number;
  /** Minutes a run may stay in progress before it counts as failed. */
  maxRuntime?: number;
  /** A tz database name; the schedule is read in it. */
  timezone?: string;
}

/** One run of a monitored job, started with `startCheckIn`. */
export interface CronCheckIn {
  /** Ends the run. Only the first call counts. */
  finish(status: 'ok' | 'error'): void;
}

/** The reporter of a server runtime: it can also check a job in to a Sentry cron monitor. */
export interface ServerErrorReporter extends ErrorReporter {
  /**
   * Tells the monitor that a run started, and returns what ends it. Sentry then alerts when a
   * run fails, is missed (no check-in in time) or runs too long. The check-in carries the
   * environment and release and nothing else: no tags, no personal data. Sent with the next
   * `flush()`.
   */
  startCheckIn(monitor: CronMonitor): CronCheckIn;
}

export interface ErrorReporterOptions {
  /** Defaults to `process.env` (`SENTRY_DSN`, `RAILWAY_*`). */
  env?: EnvironmentVariables;
  /** Tests pass `createCaptureTransport()`; production posts to Sentry. */
  transport?: ErrorTransport;
}

/**
 * Error reporting for a server runtime (the API inside Next.js, the cron job). Its own Sentry
 * client, not the global one: no auto-instrumentation, no tracing, no session replay and no
 * process-wide handlers. Every event goes through the scrubber before it is sent.
 */
export function createErrorReporter(options: ErrorReporterOptions = {}): ServerErrorReporter {
  const config = readErrorReportingConfig(options.env);
  if (!config.dsn) return DISABLED_SERVER_REPORTER;
  const transport = options.transport ?? createFetchTransport();
  const client = new ServerRuntimeClient({
    ...sharedClientOptions({ ...config, dsn: config.dsn }, transport),
    platform: 'node',
    runtime: { name: 'node', version: process.version },
    integrations: [linkedErrorsIntegration()],
    stackParser: createStackParser(nodeStackLineParser()),
  });
  const scope = new Scope();
  scope.setClient(client);
  client.init();

  return {
    enabled: true,
    captureError: (error, context = {}) => {
      const eventScope = scope.clone();
      if (context.level) eventScope.setLevel(context.level);
      const { request, route, tags } = context;
      for (const [name, value] of Object.entries(tags ?? {})) eventScope.setTag(name, value);
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
    startCheckIn: (monitor) => {
      const config = {
        schedule: { type: 'crontab' as const, value: monitor.crontab },
        checkinMargin: monitor.checkinMargin,
        maxRuntime: monitor.maxRuntime,
        timezone: monitor.timezone,
      };
      const started = performance.now();
      const checkInId = client.captureCheckIn(
        { monitorSlug: monitor.slug, status: 'in_progress' },
        config,
        scope,
      );
      let finished = false;
      return {
        finish: (status) => {
          if (finished) return;
          finished = true;
          client.captureCheckIn(
            {
              checkInId,
              monitorSlug: monitor.slug,
              status,
              duration: (performance.now() - started) / 1000,
            },
            config,
            scope,
          );
        },
      };
    },
  };
}

/** The reporter without a DSN: captures nothing, checks nothing in, sends nothing. */
const DISABLED_SERVER_REPORTER: ServerErrorReporter = {
  ...DISABLED_REPORTER,
  startCheckIn: () => ({ finish: () => {} }),
};

function toRequestData(request: Request | RequestDetails): RequestEventData {
  if (request instanceof Request) return winterCGRequestToRequestData(request);
  const headers = Object.entries(request.headers ?? {}).flatMap(([name, value]) =>
    value === undefined ? [] : [[name, Array.isArray(value) ? value.join(', ') : value] as const],
  );
  return { method: request.method, url: request.url, headers: Object.fromEntries(headers) };
}
