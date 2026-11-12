import {
  type EnvironmentVariables,
  readBrowserErrorReportingConfig,
  readPageViewsConfig,
} from './config.ts';

/**
 * The origins the browser sends error reports (Sentry) and page views (PostHog) to, from the
 * same variables the browser code reads (`NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_POSTHOG_KEY`,
 * `POSTHOG_HOST`), for the `connect-src` of the Content-Security-Policy (E013). Each is named,
 * never a wildcard; an origin is left out where its feature is off, so the policy allows only
 * what the page really talks to.
 */
export function browserConnectOrigins(env: EnvironmentVariables): string[] {
  const { dsn } = readBrowserErrorReportingConfig(env);
  const { host } = readPageViewsConfig(env);
  return [dsn, host].flatMap((address) => {
    const origin = address ? httpsOrigin(address) : undefined;
    return origin ? [origin] : [];
  });
}

function httpsOrigin(address: string): string | undefined {
  if (!URL.canParse(address)) return undefined;
  const url = new URL(address);
  return url.protocol === 'https:' ? url.origin : undefined;
}
