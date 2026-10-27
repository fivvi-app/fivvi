import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createApp, NO_DEPENDENCIES } from '../../src/index.ts';

type Operation = { operationId: string; 'x-access'?: { type: string } };
const contract: { paths: Record<string, Record<string, Operation>> } = JSON.parse(
  readFileSync(new URL('../../../contract/openapi.json', import.meta.url), 'utf8'),
);

/** Every account and workspace operation of the committed contract, with a concrete URL path. */
const protectedOperations = Object.entries(contract.paths).flatMap(([path, item]) =>
  Object.entries(item)
    .filter(([, operation]) => ['account', 'workspace'].includes(operation['x-access']?.type ?? ''))
    .map(([method, operation]) => ({
      name: operation.operationId,
      method: method.toUpperCase(),
      path: path.replaceAll(/{[^}]+}/g, '0197c0de-0000-7000-8000-0000000000a1'),
    })),
);

describe('E011 access', () => {
  it('AC7: anonymous gets 401 on every workspace and account route', async () => {
    // Nobody is signed in: the default dependencies resolve no account.
    const app = createApp(NO_DEPENDENCIES);
    // The contract has account routes today; the check must not pass by looking at nothing.
    expect(protectedOperations.map((operation) => operation.name)).toContain('getMe');

    for (const operation of protectedOperations) {
      // Whatever its body or query: valid-looking, invalid, malformed or missing.
      for (const [query, body] of [
        ['', undefined],
        ['?page=not-a-number&locale=xx', '{"unexpected":true}'],
        ['', 'not json'],
      ] as const) {
        const response = await app.request(`${operation.path}${query}`, {
          method: operation.method,
          headers: { 'content-type': 'application/json' },
          body: operation.method === 'GET' ? undefined : body,
        });

        expect(response.status, `${operation.name} ${query}`).toBe(401);
        expect(await response.json(), operation.name).toEqual({ code: 'not_signed_in' });
      }
    }
  });
});
