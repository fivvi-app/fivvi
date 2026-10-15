import type { CaptureResult } from 'posthog-js/dist/module.slim.no-external';
import { describe, expect, it } from 'vitest';
import { scrubPageView } from './page-views.ts';

// Synthetic personal data only (AGENTS.md, D8).
const KEY = 'phc_example_project_key';
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
      $os: 'Mac OS X',
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
        $os: 'Mac OS X',
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
