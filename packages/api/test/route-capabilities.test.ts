import { readFileSync } from 'node:fs';
import { CAPABILITIES, rolesWith } from '@fivvi/domain';
import { describe, expect, it } from 'vitest';
import { type ContractDocument, describeOperations } from './isolation/coverage.ts';

// F004 AC1: every route of a workspace names the capability it needs (the permission matrix in
// @fivvi/domain turns it into the roles). Reads the committed contract, so a route that forgets
// its capability fails here; no database.

type Access = { capability?: string; roles?: readonly string[]; client?: string };

/** One sentence per workspace operation whose `x-access` names no capability or a wrong one. */
function capabilityProblems(document: ContractDocument): string[] {
  const problems: string[] = [];
  for (const { name, access } of describeOperations(document)) {
    if (access?.type !== 'workspace') continue;
    const { capability, roles } = access as Access;
    if (capability === undefined) {
      problems.push(`${name} has an x-access without a capability.`);
    } else if (!(CAPABILITIES as readonly string[]).includes(capability)) {
      problems.push(`${name} names the unknown capability "${capability}".`);
    } else if (JSON.stringify(roles) !== JSON.stringify(rolesWith(capability as never))) {
      problems.push(`${name} lists roles that are not the matrix's for ${capability}.`);
    }
  }
  return problems;
}

const contract = JSON.parse(
  readFileSync(new URL('../../contract/openapi.json', import.meta.url), 'utf8'),
) as ContractDocument;

const workspaceRoute = (access: object): ContractDocument => ({
  paths: {
    '/v1/workspaces/{workspaceId}/x': { get: { operationId: 'getX', 'x-access': access } },
  },
});

describe('F004 route capabilities', () => {
  it('AC1: every workspace-scoped route in openapi.json declares a capability', () => {
    const workspaceRoutes = describeOperations(contract).filter(
      ({ access }) => access?.type === 'workspace',
    );

    expect(workspaceRoutes.length).toBeGreaterThan(0);
    expect(capabilityProblems(contract)).toEqual([]);
  });

  it('AC1: names a workspace route whose x-access has no capability', () => {
    const document = workspaceRoute({ type: 'workspace', roles: ['owner'], client: 'none' });

    expect(capabilityProblems(document)).toEqual(['getX has an x-access without a capability.']);
  });

  it('AC1: names an unknown capability and roles that differ from the matrix', () => {
    expect(
      capabilityProblems(
        workspaceRoute({ type: 'workspace', capability: 'money.take', roles: [], client: 'none' }),
      ),
    ).toEqual(['getX names the unknown capability "money.take".']);
    expect(
      capabilityProblems(
        workspaceRoute({
          type: 'workspace',
          capability: 'team.manage',
          roles: ['owner', 'trainer'],
          client: 'none',
        }),
      ),
    ).toEqual(["getX lists roles that are not the matrix's for team.manage."]);
  });

  it('leaves account and public routes alone', () => {
    const document: ContractDocument = {
      paths: { '/v1/me': { get: { operationId: 'getMe', 'x-access': { type: 'account' } } } },
    };

    expect(capabilityProblems(document)).toEqual([]);
  });
});
