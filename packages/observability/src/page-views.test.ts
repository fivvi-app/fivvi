import type { CaptureResult } from 'posthog-js/dist/module.slim.no-external';
import { describe, expect, it, vi } from 'vitest';
import { capturePageView, scrubPageView } from './page-views.ts';

// The PostHog SDK is the boundary: record how capturePageView() starts it, send nothing.
const sdk = vi.hoisted(() => ({ init: vi.fn(), capture: vi.fn() }));
vi.mock('posthog-js/dist/module.slim.no-external', () => ({ posthog: sdk }));

// Synthetic personal data only (AGENTS.md, D8).
const KEY = 'phc_example_project_key';
// A synthetic host: page views go wherever POSTHOG_HOST says, never to a built-in address.
const HOST = 'https://posthog.example.test';
const URL_WITH_PERSONAL_DATA =
  'https://app.example.com/clients/3f2e1d0c-9b8a-4765-8432-10fedcba9876?name=Anna&email=anna.devries%40example.com#notes';
const PERSONAL = ['Anna', 'devries', 'notes', 'mail.example.com', 'utm', 'Ledenlijst'];

/** A $pageview as posthog-js builds it, before `before_send`. */
function pageView(properties: CaptureResult['properties'] = {}): CaptureResult {
  return {
    uuid: '01890f6e-0000-7000-8000-000000000001',
    event: '$pageview',
    timestamp: new Date('2026-10-15T08:00:00Z'),
    properties: {
      token: KEY,
      distinct_id: '$posthog_cookieless',
      $cookieless_mode: true,
      $process_person_profile: false,
      $lib: 'web',
      $lib_version: '1.438.10',
      $insert_id: 'abc123',
      $time: 1_760_515_200,
      $current_url: URL_WITH_PERSONAL_DATA,
      $host: 'app.example.com',
      $pathname: '/clients/3f2e1d0c-9b8a-4765-8432-10fedcba9876',
      $browser: 'Chrome',
      $browser_version: 140,
      $os: 'Mac OS X',
      $os_version: '15.0',
      $device_type: 'Desktop',
      $raw_user_agent: 'Mozilla/5.0 (Macintosh) Chrome/140.0',
      $timezone: 'Europe/Amsterdam',
      $browser_language: 'nl-NL',
      $browser_language_prefix: 'nl',
      $screen_width: 1280,
      $viewport_width: 1280,
      $device_id: null,
      $pageview_id: '01890f6e-0000-7000-8000-000000000001',
      $initialization_time: '2026-10-15T08:00:00.000Z',
      $referrer: 'https://mail.example.com/inbox?to=anna.devries@example.com',
      $referring_domain: 'mail.example.com',
      title: 'Anna de Vries · Ledenlijst',
      utm_source: 'newsletter',
      $search_engine: 'google',
      ...properties,
    },
    $set: { $current_url: URL_WITH_PERSONAL_DATA, email: 'anna.devries@example.com' },
    $set_once: { $initial_referrer: 'https://mail.example.com/inbox' },
  };
}

describe('E009 page view capture', () => {
  it('AC6: starts posthog-js once, cookieless, for the POSTHOG_HOST, with autocapture, recording and surveys off', async () => {
    await capturePageView({ key: KEY, host: HOST });
    await capturePageView({ key: KEY, host: HOST });

    expect(sdk.init).toHaveBeenCalledOnce();
    expect(sdk.init).toHaveBeenCalledWith(
      KEY,
      expect.objectContaining({
        api_host: HOST,
        cookieless_mode: 'always',
        persistence: 'memory',
        disable_persistence: true,
        capture_pageview: false,
        autocapture: false,
        disable_session_recording: true,
        disable_surveys: true,
        before_send: scrubPageView,
      }),
    );
    expect(sdk.capture.mock.calls).toEqual([['$pageview'], ['$pageview']]);
  });
});

describe('E009 page view scrubber', () => {
  it('AC6: sends the path only: no query string, fragment, title, referrer or person data', () => {
    const scrubbed = scrubPageView(pageView());

    expect(scrubbed).toEqual({
      uuid: '01890f6e-0000-7000-8000-000000000001',
      event: '$pageview',
      timestamp: new Date('2026-10-15T08:00:00Z'),
      properties: {
        token: KEY,
        distinct_id: '$posthog_cookieless',
        $cookieless_mode: true,
        $process_person_profile: false,
        $lib: 'web',
        $lib_version: '1.438.10',
        $insert_id: 'abc123',
        $time: 1_760_515_200,
        $current_url: 'https://app.example.com/clients/3f2e1d0c-9b8a-4765-8432-10fedcba9876',
        $host: 'app.example.com',
        $pathname: '/clients/3f2e1d0c-9b8a-4765-8432-10fedcba9876',
        $browser: 'Chrome',
        $browser_version: 140,
        $os: 'Mac OS X',
        $os_version: '15.0',
        $device_type: 'Desktop',
        $raw_user_agent: 'Mozilla/5.0 (Macintosh) Chrome/140.0',
        $timezone: 'Europe/Amsterdam',
      },
    });
    for (const value of PERSONAL) expect(JSON.stringify(scrubbed)).not.toContain(value);
  });

  it('AC6: drops every event other than a page view', () => {
    for (const event of ['$autocapture', '$rageclick', '$pageleave', '$snapshot', 'survey sent']) {
      expect(scrubPageView({ ...pageView(), event })).toBeNull();
    }
  });

  it('drops a page view whose URL is not a URL', () => {
    expect(scrubPageView(pageView({ $current_url: 'not a url' }))).toBeNull();
    expect(scrubPageView(pageView({ $current_url: undefined }))).toBeNull();
  });
});
