import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildOpenApiDocument, createApp, NO_DEPENDENCIES } from '../../src/index.ts';
import {
  accessCoverageProblems,
  type ContractDocument,
  isolationCoverageProblems,
  listOperations,
} from './coverage.ts';
import { ISOLATION_CASES } from './isolation-cases.ts';
import { registerProbeRoutes } from './probe-routes.ts';
import { PUBLIC_ROUTES } from './public-routes.ts';

const contract: ContractDocument = JSON.parse(
  readFileSync(new URL('../../../contract/openapi.json', import.meta.url), 'utf8'),
);

// The API the isolation suite calls: the real routes and the probe routes of the test app, which
// are not in the contract. Built without a database.
const testApp = createApp(NO_DEPENDENCIES);
registerProbeRoutes(testApp);
const testAppDocument = buildOpenApiDocument(testApp) as ContractDocument;

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

describe('AC14: every workspace and account route has an isolation case', () => {
  const caseNames = Object.keys(ISOLATION_CASES);
  const account = { 'x-access': { type: 'account' } };
  const workspace = {
    'x-access': { type: 'workspace', roles: ['owner'], client: 'none' },
  };

  it('holds for the contract and the test app', () => {
    expect(isolationCoverageProblems(contract, testAppDocument, caseNames)).toEqual([]);
  });

  it('the test app serves every operation of the contract', () => {
    const served = new Set(listOperations(testAppDocument).map((operation) => operation.name));

    for (const { name } of listOperations(contract)) expect(served.has(name), name).toBe(true);
  });

  it('names a workspace route without an isolation case', () => {
    const doc = document({
      '/v1/workspaces/{workspaceId}/notes': { operationId: 'listNotes', ...workspace },
    });

    expect(isolationCoverageProblems(doc, doc, [])).toEqual([
      expect.stringContaining('listNotes has no isolation case'),
    ]);
  });

  it('names an account route without an isolation case', () => {
    const doc = document({ '/v1/me/calendar': { operationId: 'getCalendar', ...account } });

    expect(isolationCoverageProblems(doc, doc, [])).toEqual([
      expect.stringContaining('getCalendar has no isolation case'),
    ]);
  });

  it('names a case for an operation that no longer exists', () => {
    const problems = isolationCoverageProblems(document({}), document({}), ['listGone']);

    expect(problems).toEqual([expect.stringContaining('listGone is an isolation case')]);
  });

  it('names a case for an operation that is public', () => {
    const doc = document({
      '/v1/open': { operationId: 'getOpen', 'x-access': { type: 'public' } },
    });

    expect(isolationCoverageProblems(doc, doc, ['getOpen'])).toEqual([
      expect.stringContaining('getOpen is an isolation case'),
    ]);
  });

  it('names a contract operation the test app does not serve', () => {
    const contractDoc = document({ '/v1/me': { operationId: 'getMe', ...account } });

    expect(isolationCoverageProblems(contractDoc, document({}), ['getMe'])).toEqual(
      expect.arrayContaining([expect.stringContaining('getMe is in the contract but not served')]),
    );
  });

  it('accepts a probe route of the test app with a case', () => {
    const contractDoc = document({});
    const app = document({
      '/v1/workspaces/{workspaceId}/probe': { operationId: 'probe', ...workspace },
    });

    expect(isolationCoverageProblems(contractDoc, app, ['probe'])).toEqual([]);
  });
});
