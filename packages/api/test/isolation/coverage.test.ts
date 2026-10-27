import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { accessCoverageProblems, type ContractDocument, listOperations } from './coverage.ts';
import { PUBLIC_ROUTES } from './public-routes.ts';

const contract: ContractDocument = JSON.parse(
  readFileSync(new URL('../../../contract/openapi.json', import.meta.url), 'utf8'),
);

const document = (operations: Record<string, Record<string, unknown>>): ContractDocument => ({
  paths: Object.fromEntries(
    Object.entries(operations).map(([path, operation]) => [path, { get: operation }]),
  ),
});

describe('AC14: every operation declares access and has a case or is on the public list', () => {
  it('holds for the committed openapi.json', () => {
    expect(accessCoverageProblems(contract, PUBLIC_ROUTES)).toEqual([]);
  });

  it('has operations to check, and declares getMe as an account route', () => {
    const operations = listOperations(contract);

    expect(operations.length).toBeGreaterThan(0);
    expect(operations).toContainEqual({ name: 'getMe', accessType: 'account' });
  });

  it('names an operation without x-access', () => {
    const problems = accessCoverageProblems(
      document({ '/v1/open': { operationId: 'getOpen' } }),
      {},
    );

    expect(problems).toEqual([expect.stringContaining('getOpen has no x-access')]);
  });

  it('names a public operation that is not on the allow-list', () => {
    const problems = accessCoverageProblems(
      document({ '/v1/open': { operationId: 'getOpen', 'x-access': { type: 'public' } } }),
      {},
    );

    expect(problems).toEqual([expect.stringContaining('getOpen is public but not on the')]);
  });

  it('names an allow-list entry for an operation that does not exist', () => {
    const problems = accessCoverageProblems(document({}), { getGone: 'It used to exist.' });

    expect(problems).toEqual([expect.stringContaining('getGone is on the public-routes')]);
  });

  it('names an allow-list entry for an operation that is no longer public', () => {
    const problems = accessCoverageProblems(
      document({ '/v1/me': { operationId: 'getMe', 'x-access': { type: 'account' } } }),
      { getMe: 'It was public once.' },
    );

    expect(problems).toEqual([expect.stringContaining('getMe is on the public-routes')]);
  });

  it('accepts a public operation on the allow-list and an account operation', () => {
    const problems = accessCoverageProblems(
      document({
        '/v1/open': { operationId: 'getOpen', 'x-access': { type: 'public' } },
        '/v1/me': { operationId: 'getMe', 'x-access': { type: 'account' } },
      }),
      { getOpen: 'Anyone may.' },
    );

    expect(problems).toEqual([]);
  });
});
