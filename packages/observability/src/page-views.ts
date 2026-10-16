import type {
  CaptureResult,
  PostHog,
  PostHogConfig,
} from 'posthog-js/dist/module.slim.no-external';

export { type PageViewsConfig, readPageViewsConfig } from './config.ts';

/**
 * posthog-js without its extensions (autocapture, heatmaps, session recording, surveys, …),
 * and without the loader for remote scripts. Every option that collects or stores anything is
 * off as well, so nothing depends on SDK defaults (OBSERVABILITY.md §5).
 */
const OPTIONS: Partial<PostHogConfig> = {
  // No cookies, localStorage or sessionStorage: PostHog counts visitors with a daily hash.
  cookieless_mode: 'always',
  persistence: 'memory',
  disable_persistence: true,
  person_profiles: 'never',
  // Page views are captured by hand, with the path only.
  capture_pageview: false,
  capture_pageleave: false,
  autocapture: false,
  rageclick: false,
  capture_dead_clicks: false,
  capture_heatmaps: false,
  capture_exceptions: false,
  capture_performance: false,
  disable_scroll_properties: true,
  disable_session_recording: true,
  disable_surveys: true,
  disable_product_tours: true,
  disable_conversations: true,
  disable_web_experiments: true,
  // No remote config, feature flags or scripts from PostHog: the options above stay as they are.
  advanced_disable_flags: true,
  disable_external_dependency_loading: true,
  save_referrer: false,
  save_campaign_params: false,
  internal_or_test_user_hostname: null,
  // Each page view leaves at once, instead of in a batch that may be lost when the tab closes.
  request_batching: false,
  before_send: scrubPageView,
};

/** The properties a page view keeps; everything else posthog-js adds is dropped. */
const PROPERTIES = new Set([
  // What PostHog needs to ingest the event and to count visitors without cookies.
  'token',
  'distinct_id',
  '$cookieless_mode',
  '$process_person_profile',
  '$lib',
  '$lib_version',
  '$insert_id',
  '$time',
  // The page, rebuilt from the URL below.
  '$current_url',
  '$host',
  '$pathname',
  // The kind of browser and device, as posthog-js reads it from the user agent; the time zone
  // and the user agent also go into PostHog's daily visitor hash.
  '$browser',
  '$browser_version',
  '$os',
  '$os_version',
  '$device_type',
  '$raw_user_agent',
  '$timezone',
]);

let started: Promise<PostHog> | undefined;

/** Where page views go: the project key and `POSTHOG_HOST`, as `readPageViewsConfig()` read them. */
export interface PageViewsTarget {
  key: string;
  host: string;
}

/**
 * Sends one `$pageview` for the page the browser shows, with its path only. Call it once per
 * page: on load and after every client-side navigation. Loads posthog-js on the first call, so
 * a page that never calls it never loads the SDK. Never throws or rejects: analytics must
 * never break a page, and an ad blocker may block the SDK or PostHog.
 */
export async function capturePageView(target: PageViewsTarget): Promise<void> {
  try {
    started ??= startPostHog(target);
    (await started).capture('$pageview');
  } catch {
    // Nothing to report: a missing page view is not an error.
  }
}

async function startPostHog({ key, host }: PageViewsTarget): Promise<PostHog> {
  const { posthog } = await import('posthog-js/dist/module.slim.no-external');
  posthog.init(key, { ...OPTIONS, api_host: host });
  return posthog;
}

/**
 * posthog-js's `before_send`: lets only page views leave, with the allowlisted properties and
 * the URL cut down to its path. Drops the query string, fragment, page title, referrer,
 * campaign parameters and person properties, which can hold names, email addresses or notes.
 */
export function scrubPageView(result: CaptureResult): CaptureResult | null {
  if (result.event !== '$pageview') return null;
  const url = parseUrl(result.properties.$current_url);
  if (!url) return null;
  const properties = Object.fromEntries(
    Object.entries(result.properties).filter(([name]) => PROPERTIES.has(name)),
  );
  return {
    uuid: result.uuid,
    event: result.event,
    ...(result.timestamp && { timestamp: result.timestamp }),
    properties: {
      ...properties,
      $current_url: `${url.origin}${url.pathname}`,
      $host: url.host,
      $pathname: url.pathname,
    },
  };
}

function parseUrl(value: unknown): URL | undefined {
  if (typeof value !== 'string' || !URL.canParse(value)) return undefined;
  return new URL(value);
}
