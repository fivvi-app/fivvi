import type { XAccess } from './expectations.ts';

/**
 * The contract coverage check (E011, AC14). First half: what `openapi.json` declares about access
 * against the public-routes allow-list (`accessCoverageProblems`). Second half: every workspace
 * and account route has an isolation case, and no case names an operation that no longer exists
 * (`isolationCoverageProblems`). Neither needs a database.
 */

type Operation = { operationId?: string; 'x-access'?: { type?: string } & Partial<XAccess> };
export type ContractDocument = {
  paths?: Record<string, Record<string, Operation | undefined> | undefined>;
};

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

/** The operations of the document with everything the isolation suite needs to call them. */
export function describeOperations(
  document: ContractDocument,
): { name: string; method: string; path: string; access: XAccess | undefined }[] {
  const operations: { name: string; method: string; path: string; access: XAccess | undefined }[] =
    [];
  for (const [path, item] of Object.entries(document.paths ?? {})) {
    for (const method of METHODS) {
      const operation = item?.[method];
      if (!operation) continue;
      operations.push({
        name: operation.operationId ?? `${method.toUpperCase()} ${path}`,
        method: method.toUpperCase(),
        path,
        access: operation['x-access'] as XAccess | undefined,
      });
    }
  }
  return operations;
}

/** The operations of the document: the ID (or `METHOD path` without one) and its declared access. */
export function listOperations(
  document: ContractDocument,
): { name: string; accessType: string | undefined }[] {
  const operations: { name: string; accessType: string | undefined }[] = [];
  for (const [path, item] of Object.entries(document.paths ?? {})) {
    for (const method of METHODS) {
      const operation = item?.[method];
      if (!operation) continue;
      operations.push({
        name: operation.operationId ?? `${method.toUpperCase()} ${path}`,
        accessType: operation['x-access']?.type,
      });
    }
  }
  return operations;
}

/** One sentence per problem, each naming the operation. Empty when the contract is covered. */
export function accessCoverageProblems(
  document: ContractDocument,
  publicRoutes: Readonly<Record<string, string>>,
): string[] {
  const problems: string[] = [];
  const operations = listOperations(document);
  const names = new Set(operations.map((operation) => operation.name));
  for (const { name, accessType } of operations) {
    if (accessType === undefined) {
      problems.push(`${name} has no x-access: define the route with defineRoute and its access.`);
    } else if (!['public', 'account', 'workspace'].includes(accessType)) {
      problems.push(`${name} has an unknown x-access type "${accessType}".`);
    } else if (accessType === 'public' && !(name in publicRoutes)) {
      problems.push(`${name} is public but not on the public-routes allow-list.`);
    } else if (accessType !== 'public' && name in publicRoutes) {
      problems.push(`${name} is on the public-routes allow-list but is not declared public.`);
    }
  }
  for (const name of Object.keys(publicRoutes)) {
    if (!names.has(name)) {
      problems.push(`${name} is on the public-routes allow-list but is not an operation.`);
    }
  }
  return problems;
}

const NEEDS_A_CASE = ['account', 'workspace'];

/**
 * One sentence per problem, each naming the operation: a workspace or account operation of the
 * contract without an isolation case; a case for something that isn't a workspace or account
 * operation of the test app (the contract's routes and the test app's probe routes); a contract
 * operation the test app doesn't serve, which the suite would never call.
 */
export function isolationCoverageProblems(
  contract: ContractDocument,
  testApp: ContractDocument,
  caseNames: readonly string[],
): string[] {
  const problems: string[] = [];
  const served = describeOperations(testApp);
  const servedNames = new Set(served.map((operation) => operation.name));
  for (const { name, access } of describeOperations(contract)) {
    if (!servedNames.has(name)) {
      problems.push(`${name} is in the contract but not served by the test app.`);
    }
    if (NEEDS_A_CASE.includes(access?.type ?? '') && !caseNames.includes(name)) {
      problems.push(`${name} has no isolation case: add one to ISOLATION_CASES (see the README).`);
    }
  }
  const needing = new Set(
    served.filter((op) => NEEDS_A_CASE.includes(op.access?.type ?? '')).map((op) => op.name),
  );
  for (const name of caseNames) {
    if (!needing.has(name)) {
      problems.push(
        `${name} is an isolation case but no workspace or account operation: remove it.`,
      );
    }
  }
  return problems;
}
