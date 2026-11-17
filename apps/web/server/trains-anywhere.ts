import type { Schemas } from '@fivvi/contract';

/**
 * Whether the account has a trainer profile in at least one workspace (F005): the people who get
 * *Persoonlijk*, *Mijn dag* and *Mijn agenda* (F013, `information-architecture.md §4.3`). A Trainer
 * always trains, so `GET /v1/me` (the `workspaces` here) settles it; only an Owner has a switch of
 * their own (`trainsHere`, which only `GET /v1/me/workspaces` tells), and it is asked for only then.
 * `loadWorkspaces` reads that list.
 */
export async function trainsAnywhere(
  workspaces: readonly Pick<Schemas['MeWorkspace'], 'role'>[],
  loadWorkspaces: () => Promise<readonly Pick<Schemas['MyWorkspace'], 'trainsHere'>[]>,
): Promise<boolean> {
  if (workspaces.some(({ role }) => role === 'trainer')) return true;
  if (workspaces.length === 0) return false;
  return (await loadWorkspaces()).some(({ trainsHere }) => trainsHere);
}
