import { createCaptureTransport, createErrorReporter } from '@fivvi/observability';
import { describe, expect, it } from 'vitest';
import { checkLettermintUsage } from '../src/lettermint-usage.ts';

const DSN = 'https://public@o0.ingest.de.sentry.io/1';
const TEAM_TOKEN = 'lm_team_not-a-real-token';
const API_URL = 'https://team-api.example.com/v1';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

/** A stubbed Team API: `included` is the plan's volume, `used` this month's usage. */
function stubTeamApi({ included, used }: { included: unknown; used: unknown }) {
  const requests: { url: string; authorization: string | null }[] = [];
  const fetch = (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    requests.push({ url, authorization: new Headers(init.headers).get('authorization') });
    if (url === `${API_URL}/team`) {
      return Promise.resolve(json(200, { id: 'team-1', plan: 'free', included_volume: included }));
    }
    if (url === `${API_URL}/team/usage`) {
      return Promise.resolve(
        json(200, {
          current_period: {
            usage: used,
            last_incremented_at: '2026-11-02T10:00:00Z',
            period_start: '2026-11-01T00:00:00Z',
            period_end: '2026-12-01T00:00:00Z',
          },
          historical_usage: [],
        }),
      );
    }
    return Promise.resolve(json(404, { error: { code: 'NOT_FOUND', message: 'No' } }));
  };
  return { fetch, requests };
}

async function run(options: {
  teamToken?: string;
  fetch: typeof globalThis.fetch;
}): Promise<{ events: ReturnType<typeof createCaptureTransport>['events']; logs: string[] }> {
  const transport = createCaptureTransport();
  const errorReporter = createErrorReporter({ env: { SENTRY_DSN: DSN }, transport });
  const logs: string[] = [];
  await checkLettermintUsage({
    teamToken: options.teamToken,
    apiUrl: API_URL,
    fetch: options.fetch,
    errorReporter,
    log: (message) => logs.push(message),
  });
  await errorReporter.flush();
  return { events: transport.events, logs };
}

describe('E006 Lettermint usage alert (ADR-028, R14)', () => {
  it('AC1: reports a warning to Sentry at 70% of the included volume', async () => {
    const api = stubTeamApi({ included: 300, used: 210 });

    const { events } = await run({ teamToken: TEAM_TOKEN, fetch: api.fetch });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      level: 'warning',
      exception: {
        values: [
          expect.objectContaining({
            value: 'Lettermint usage is 210 of 300 emails this month (70%)',
          }),
        ],
      },
    });
  });

  it('AC1: reports above 70%, up to and past the limit', async () => {
    const { events } = await run({
      teamToken: TEAM_TOKEN,
      fetch: stubTeamApi({ included: 300, used: 300 }).fetch,
    });

    expect(events).toHaveLength(1);
    expect(JSON.stringify(events[0])).toContain('300 of 300 emails this month (100%)');
  });

  it('AC1: reports nothing below 70%', async () => {
    const api = stubTeamApi({ included: 300, used: 209 });

    const { events, logs } = await run({ teamToken: TEAM_TOKEN, fetch: api.fetch });

    expect(events).toEqual([]);
    expect(logs).toEqual(['Lettermint usage: 209 of 300 emails this month (69%).']);
  });

  it('reads the plan and the usage with the team token as a bearer token', async () => {
    const api = stubTeamApi({ included: 10_000, used: 0 });

    await run({ teamToken: TEAM_TOKEN, fetch: api.fetch });

    expect(api.requests.map((request) => request.url).sort()).toEqual([
      `${API_URL}/team`,
      `${API_URL}/team/usage`,
    ]);
    for (const request of api.requests) {
      expect(request.authorization).toBe(`Bearer ${TEAM_TOKEN}`);
    }
  });

  it('AC2: reports a failing Team API call once, without the token, and does not throw', async () => {
    const fetch = () =>
      Promise.resolve(json(403, { error: { code: 'FORBIDDEN', message: TEAM_TOKEN } }));

    const { events, logs } = await run({ teamToken: TEAM_TOKEN, fetch });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      level: 'error',
      exception: { values: [expect.objectContaining({ value: 'lettermint: HTTP 403 FORBIDDEN' })] },
    });
    expect(JSON.stringify(events)).not.toContain(TEAM_TOKEN);
    expect(logs).toEqual([]);
  });

  it('AC2: reports a network error once', async () => {
    const fetch = () => Promise.reject(new TypeError('fetch failed'));

    const { events } = await run({ teamToken: TEAM_TOKEN, fetch });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      // Sentry lists the cause (`fetch failed`) next to the error itself.
      exception: {
        values: expect.arrayContaining([
          expect.objectContaining({ value: 'lettermint: network error' }),
        ]),
      },
    });
  });

  it.each([
    ['no included volume', { included: null, used: 3 }],
    ['an included volume of 0', { included: 0, used: 3 }],
    ['no usage', { included: 300, used: 'many' }],
  ])('AC2: reports an answer it cannot read once (%s)', async (_name, values) => {
    const { events } = await run({ teamToken: TEAM_TOKEN, fetch: stubTeamApi(values).fetch });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      level: 'error',
      exception: {
        values: [expect.objectContaining({ value: 'lettermint: unexpected Team API response' })],
      },
    });
  });

  it.each([undefined, ''])('AC3: skips the check without a team token (%j)', async (teamToken) => {
    let calls = 0;
    const fetch = () => {
      calls += 1;
      return Promise.reject(new Error('must not be called'));
    };

    const { events, logs } = await run({ teamToken, fetch });

    expect(calls).toBe(0);
    expect(events).toEqual([]);
    expect(logs).toEqual([]);
  });
});
