import type { DatabaseExecutor } from '../client.ts';
import { organizations } from '../schema/index.ts';
import { addClient, addTeamRole, createAccount } from './factories.ts';

/**
 * Creates a valid row of one table in a given workspace (E011, AC15). The RLS suite runs every
 * check over every registered table, so a table without a factory fails it by name.
 */
export interface IsolationFactory {
  /** The column that holds the workspace: `organization_id`, or `id` for `organizations`. */
  scopeColumn: 'id' | 'organization_id';
  /** Inserts one valid row for `workspaceId` and returns its id. */
  create(db: DatabaseExecutor, workspaceId: string): Promise<{ id: string }>;
}

/**
 * The isolation factories, by table name. **A new business table adds its entry here**; the
 * conventions test in `rls.integration.test.ts` fails, naming the table, until it does. The
 * factory creates whatever the row needs next to it (for example an account), in the same
 * workspace, and nothing in any other.
 */
export const isolationFactories: Readonly<Record<string, IsolationFactory>> = {
  // The workspace row itself: created for the given id, as `createWorkspace()` does for a new one.
  organizations: {
    scopeColumn: 'id',
    create: async (db, workspaceId) => {
      const [row] = await db
        .insert(organizations)
        .values({ id: workspaceId })
        .returning({ id: organizations.id });
      if (!row) throw new Error('workspace was not created.');
      return row;
    },
  },
  team_members: {
    scopeColumn: 'organization_id',
    create: async (db, workspaceId) =>
      addTeamRole(db, { workspaceId, accountId: (await createAccount(db, { label: 'team' })).id }),
  },
  clients: {
    scopeColumn: 'organization_id',
    create: async (db, workspaceId) =>
      addClient(db, { workspaceId, accountId: (await createAccount(db, { label: 'client' })).id }),
  },
};
