/**
 * The contract coverage check (E011, AC14), first half: what `openapi.json` declares about access
 * against the public-routes allow-list. The other half, an isolation case for every workspace and
 * account route, comes with the isolation suite.
 */

type Operation = { operationId?: string; 'x-access'?: { type?: string } };
export type ContractDocument = {
  paths?: Record<string, Record<string, Operation | undefined> | undefined>;
};

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

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
