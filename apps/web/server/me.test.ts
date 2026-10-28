import { type ApiDependencies, createApiHandler, NO_DEPENDENCIES } from '@fivvi/api';
import { createTenantScopes } from '@fivvi/database';
import { describe, expect, it } from 'vitest';
import { inProcessApiClient } from './api-client';
import { loadMe } from './me';

// The generated client calls the real API handler in-process (as greeting.test.ts does), with a
// fake sign-in and a stand-in transaction on which every query finds nothing: no account has a
// team role (the API integration tests cover the workspaces it lists).
const noRows = { from: () => ({ where: () => Promise.resolve([]) }) };
const tenantScopes: ApiDependencies['tenantScopes'] = createTenantScopes(
  () =>
    ({
      transaction: (run: (tx: unknown) => unknown) =>
        run({ execute: () => Promise.resolve(), select: () => noRows }),
    }) as never,
);

function api(signedInWithCookie: string | undefined) {
  const seen: Headers[] = [];
  const handle = createApiHandler({
    ...NO_DEPENDENCIES,
    tenantScopes,
    signUpAllowlist: { allows: () => true },
    findSignedInAccount: (headers) => {
      seen.push(headers);
      return Promise.resolve(
        headers.get('cookie') === signedInWithCookie
          ? {
              id: '0197c0de-0000-7000-8000-000000000001',
              email: 'sarah@example.com',
              name: '',
              preferredLocale: null,
            }
          : undefined,
      );
    },
  });
  return { client: inProcessApiClient(handle), seen };
}

describe('F002 the web reads GET /api/v1/me for the person who asks', () => {
  it('sends the request’s sign-in cookie and nothing else', async () => {
    const { client, seen } = api('session=abc');

    const me = await loadMe(
      client,
      new Headers({ cookie: 'session=abc', authorization: 'Bearer x' }),
    );

    expect(me).toMatchObject({ email: 'sarah@example.com', name: null });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.get('cookie')).toBe('session=abc');
    expect(seen[0]?.get('authorization')).toBeNull();
  });

  it('is undefined when nobody is signed in', async () => {
    const { client } = api('session=abc');

    expect(await loadMe(client, new Headers())).toBeUndefined();
  });

  it('throws on any other answer, so the page is an error page and not a wrong redirect', async () => {
    const client = inProcessApiClient(() => new Response('Internal Server Error', { status: 500 }));

    await expect(loadMe(client, new Headers({ cookie: 'session=abc' }))).rejects.toThrow(
      'GET /v1/me answered 500',
    );
  });
});
