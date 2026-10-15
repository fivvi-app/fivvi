import {
  BrowserClient,
  dedupeIntegration,
  defaultStackParser,
  getCurrentScope,
  globalHandlersIntegration,
  httpContextIntegration,
  linkedErrorsIntegration,
} from '@sentry/browser';
import { DISABLED_REPORTER, FLUSH_TIMEOUT_MS, sharedClientOptions } from './client-options.ts';
import { type EnvironmentVariables, readBrowserErrorReportingConfig } from './config.ts';
import type { ErrorReporter } from './reporter.ts';
import { createFetchTransport, type ErrorTransport } from './transport.ts';

export interface BrowserErrorReportingOptions {
  /**
   * `NEXT_PUBLIC_SENTRY_DSN`, `RAILWAY_ENVIRONMENT_NAME` and `RAILWAY_GIT_COMMIT_SHA`, as
   * inlined at build time. Passed explicitly: there is no `process.env` in a browser.
   */
  env: EnvironmentVariables;
  /** Tests pass `createCaptureTransport()`; production posts to Sentry. */
  transport?: ErrorTransport;
}

/**
 * Error reporting in the browser: uncaught errors and unhandled promise rejections, plus
 * whatever `captureError` gets (for example from an error boundary). Call it once, before the
 * app renders. Errors only: no tracing, no session replay, no sessions and no breadcrumbs.
 * Every event goes through the scrubber. Without a DSN it installs nothing and sends nothing.
 */
export function initBrowserErrorReporting(options: BrowserErrorReportingOptions): ErrorReporter {
  const config = readBrowserErrorReportingConfig(options.env);
  if (!config.dsn) return DISABLED_REPORTER;
  const transport = options.transport ?? createFetchTransport();
  const client = new BrowserClient({
    ...sharedClientOptions({ ...config, dsn: config.dsn }, transport),
    integrations: [
      globalHandlersIntegration(),
      linkedErrorsIntegration(),
      dedupeIntegration(),
      // The page URL (the scrubber drops its query string and the User-Agent header).
      httpContextIntegration(),
    ],
    stackParser: defaultStackParser,
  });
  // The global handlers report through the current client, so this one becomes it.
  const scope = getCurrentScope();
  scope.setClient(client);
  client.init();

  return {
    enabled: true,
    captureError: (error) => {
      scope.captureException(error);
    },
    flush: async () => client.flush(FLUSH_TIMEOUT_MS),
  };
}
