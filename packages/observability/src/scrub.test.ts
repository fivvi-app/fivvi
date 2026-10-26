import type { Breadcrumb, ErrorEvent } from '@sentry/core';
import { describe, expect, it } from 'vitest';
import { scrubBreadcrumb, scrubEvent } from './scrub.ts';

// Synthetic personal data only (AGENTS.md, D8).
const CLIENT_NAME = 'Anna de Vries';
const EMAIL = 'anna.devries@example.com';
const NOTE = 'Knee injury, avoid deep squats';
const IP = '203.0.113.7';
const TOKEN = 'Bearer test-session-token';
const COOKIE = 'session=test-cookie-value';
const USER_ID = '0b9c4f2e-5d6a-4c1b-9e8f-1a2b3c4d5e6f';
const WORKSPACE_ID = '7d3e2a1b-8c9d-4e0f-a1b2-c3d4e5f6a7b8';
const CLIENT_ID = '3f2e1d0c-9b8a-4765-8432-10fedcba9876';
const ROUTE = '/v1/clients/:clientId/notes';
const PATH = `/api/v1/clients/${CLIENT_ID}/notes`;
const PERSONAL = [
  CLIENT_NAME,
  'Anna',
  EMAIL,
  'devries',
  NOTE,
  'Knee',
  IP,
  TOKEN,
  'test-session',
  COOKIE,
  'test-cookie',
];

function eventWithPersonalData(): ErrorEvent {
  return {
    type: undefined,
    event_id: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
    timestamp: 1_760_000_000,
    level: 'error',
    platform: 'node',
    environment: 'production',
    release: '0123456789abcdef0123456789abcdef01234567',
    transaction: `POST ${ROUTE}`,
    message: `Could not invite ${EMAIL}`,
    exception: {
      values: [
        {
          type: 'Error',
          value: `Duplicate key (email)=(${EMAIL}) for client ${CLIENT_ID}`,
          stacktrace: {
            frames: [
              {
                filename: 'notes.ts',
                function: 'saveNote',
                lineno: 12,
                in_app: true,
                vars: { text: NOTE, name: CLIENT_NAME },
              },
            ],
          },
        },
      ],
    },
    request: {
      method: 'POST',
      url: `https://app.example.com${PATH}?email=${encodeURIComponent(EMAIL)}#${CLIENT_NAME}`,
      query_string: `email=${EMAIL}&name=${CLIENT_NAME}`,
      data: { text: NOTE, clientName: CLIENT_NAME },
      cookies: { session: COOKIE },
      headers: {
        authorization: TOKEN,
        cookie: COOKIE,
        'content-type': 'application/json',
        'x-forwarded-for': IP,
        'x-client-name': CLIENT_NAME,
      },
      env: { REMOTE_ADDR: IP },
    },
    user: {
      id: USER_ID,
      organization_id: WORKSPACE_ID,
      email: EMAIL,
      username: CLIENT_NAME,
      name: CLIENT_NAME,
      ip_address: IP,
      geo: { city: 'Amsterdam' },
    },
    tags: { route: ROUTE, client_name: CLIENT_NAME },
    extra: { note: NOTE, clientName: CLIENT_NAME },
    contexts: {
      runtime: { name: 'node', version: 'v26.10.0' },
      response: { status_code: 500, headers: { 'set-cookie': COOKIE } },
      client: { name: CLIENT_NAME, note: NOTE },
    },
    breadcrumbs: [
      {
        category: 'console',
        level: 'log',
        message: `Saving note for ${CLIENT_NAME}: ${NOTE}`,
        timestamp: 1_759_999_999,
      },
    ],
  };
}

describe('E009 scrubber', () => {
  it('AC4: removes name, email, note text, body, cookies, auth header, query, IP; keeps UUIDs, route, status', () => {
    const scrubbed = scrubEvent(eventWithPersonalData());

    const sent = JSON.stringify(scrubbed);
    for (const value of PERSONAL) expect(sent).not.toContain(value);
    expect(scrubbed).toEqual({
      type: undefined,
      event_id: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
      timestamp: 1_760_000_000,
      level: 'error',
      platform: 'node',
      environment: 'production',
      release: '0123456789abcdef0123456789abcdef01234567',
      transaction: `POST ${ROUTE}`,
      message: 'Could not invite [email]',
      exception: {
        values: [
          {
            type: 'Error',
            value: `Duplicate key (email)=([email]) for client ${CLIENT_ID}`,
            stacktrace: {
              frames: [{ filename: 'notes.ts', function: 'saveNote', lineno: 12, in_app: true }],
            },
          },
        ],
      },
      request: {
        method: 'POST',
        url: `https://app.example.com${PATH}`,
        headers: { 'content-type': 'application/json' },
      },
      user: { id: USER_ID, organization_id: WORKSPACE_ID },
      tags: { route: ROUTE },
      contexts: {
        runtime: { name: 'node', version: 'v26.10.0' },
        response: { status_code: 500 },
      },
      breadcrumbs: [{ category: 'console', level: 'log', timestamp: 1_759_999_999 }],
    });
  });

  it('AC4: keeps only UUIDs in the user context', () => {
    const event = eventWithPersonalData();
    event.user = { id: EMAIL, organization_id: CLIENT_NAME };

    expect(scrubEvent(event).user).toBeUndefined();
  });

  it('AC4: masks email addresses in the URL path', () => {
    const event = eventWithPersonalData();
    event.request = { method: 'GET', url: `/api/v1/invitations/${encodeURIComponent(EMAIL)}` };

    expect(scrubEvent(event).request).toEqual({
      method: 'GET',
      url: '/api/v1/invitations/[email]',
    });
  });

  it('AC4: breadcrumbs keep the HTTP method, status code and URL path only', () => {
    const breadcrumb: Breadcrumb = {
      type: 'http',
      category: 'fetch',
      level: 'info',
      timestamp: 1_759_999_999,
      message: `POST ${EMAIL}`,
      data: {
        method: 'POST',
        url: `https://api.brevo.com/v3/smtp/email?to=${EMAIL}`,
        status_code: 201,
        body: NOTE,
        recipient: CLIENT_NAME,
      },
    };

    expect(scrubBreadcrumb(breadcrumb)).toEqual({
      type: 'http',
      category: 'fetch',
      level: 'info',
      timestamp: 1_759_999_999,
      data: { method: 'POST', url: 'https://api.brevo.com/v3/smtp/email', status_code: 201 },
    });
  });

  describe('F001 AC16: sign-in secrets', () => {
    const SIGN_IN_EMAIL = 'owner@example.com';
    const CODE = '493027';
    // Built from short parts so no high-entropy literal sits in the file (secret scanners flag it).
    const LINK_TOKEN = ['k3Zq9vXn', '0aT7bYw2', 'LmPd8RcU', 'e5HfJgS1', 'oIuVt6Nx', 'AyE'].join('');
    const SECRETS = [SIGN_IN_EMAIL, 'owner', CODE, LINK_TOKEN];

    function signInEvent(): ErrorEvent {
      return {
        type: undefined,
        level: 'error',
        message: `Sign-in failed for ${SIGN_IN_EMAIL}`,
        exception: {
          values: [
            {
              type: 'TypeError',
              value: `fetch failed: https://fivvi.app/login/confirm?token=${LINK_TOKEN}&code=${CODE} for ${SIGN_IN_EMAIL}`,
            },
          ],
        },
        request: {
          method: 'POST',
          url: `https://fivvi.app/api/auth/sign-in/link/confirm?token=${LINK_TOKEN}`,
          query_string: `token=${LINK_TOKEN}`,
          data: { email: SIGN_IN_EMAIL, code: CODE, token: LINK_TOKEN },
          headers: {
            'content-type': 'application/json',
            referer: `https://fivvi.app/login/confirm?token=${LINK_TOKEN}`,
          },
        },
        user: { email: SIGN_IN_EMAIL },
        extra: { email: SIGN_IN_EMAIL, code: CODE, token: LINK_TOKEN },
        breadcrumbs: [
          {
            category: 'fetch',
            message: `POST /api/auth/sign-in/code/verify {"email":"${SIGN_IN_EMAIL}","code":"${CODE}"}`,
            data: {
              method: 'POST',
              url: `/api/auth/sign-in/code/verify?code=${CODE}`,
              status_code: 401,
              request_body: { email: SIGN_IN_EMAIL, code: CODE },
            },
          },
          { category: 'navigation', data: { to: `/login/confirm?token=${LINK_TOKEN}` } },
        ],
      };
    }

    it('AC16: removes an email address, a code and a link token from an event', () => {
      const scrubbed = scrubEvent(signInEvent());

      const sent = JSON.stringify(scrubbed);
      for (const secret of SECRETS) expect(sent).not.toContain(secret);
      expect(scrubbed.message).toBe('Sign-in failed for [email]');
      expect(scrubbed.exception?.values?.[0]?.value).toBe(
        'fetch failed: https://fivvi.app/login/confirm?token=[redacted]&code=[redacted] for [email]',
      );
      expect(scrubbed.request).toEqual({
        method: 'POST',
        url: 'https://fivvi.app/api/auth/sign-in/link/confirm',
        headers: { 'content-type': 'application/json' },
      });
    });

    it('AC16: removes them from breadcrumbs', () => {
      for (const breadcrumb of signInEvent().breadcrumbs ?? []) {
        const sent = JSON.stringify(scrubBreadcrumb(breadcrumb));
        for (const secret of SECRETS) expect(sent).not.toContain(secret);
      }
    });
  });
});
