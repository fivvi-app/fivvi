import { type ClientOptions, createTransport } from '@sentry/core';
import type { ErrorReportingConfig } from './config.ts';
import type { ErrorReporter } from './reporter.ts';
import { NO_DATA_COLLECTION, scrubBreadcrumb, scrubEvent } from './scrub.ts';
import type { ErrorTransport } from './transport.ts';

/** How long `flush()` waits, so a slow Sentry never holds up an exit for long. */
export const FLUSH_TIMEOUT_MS = 2_000;

/** The reporter without a DSN: captures nothing, sends nothing. */
export const DISABLED_REPORTER: ErrorReporter = {
  enabled: false,
  captureError: () => {},
  flush: () => Promise.resolve(true),
};

type SharedClientOptions = Pick<
  ClientOptions,
  | 'dsn'
  | 'environment'
  | 'release'
  | 'dataCollection'
  | 'sendClientReports'
  | 'transport'
  | 'beforeSend'
  | 'beforeBreadcrumb'
>;

/**
 * The options every Sentry client shares, server and browser alike: tags, no data collection
 * by the SDK, no client reports, the scrubber on every event and breadcrumb, and our transport.
 */
export function sharedClientOptions(
  config: ErrorReportingConfig & { dsn: string },
  transport: ErrorTransport,
): SharedClientOptions {
  return {
    dsn: config.dsn,
    environment: config.environment,
    release: config.release,
    dataCollection: NO_DATA_COLLECTION,
    sendClientReports: false,
    transport: (transportOptions) =>
      createTransport(transportOptions, ({ body }) =>
        transport.send({ url: transportOptions.url, body }),
      ),
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
  };
}
