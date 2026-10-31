import type { Schemas } from '@fivvi/contract';

type Client = Schemas['Client'];

/** The biggest page the API gives; the list asks for it so most workspaces see everyone at once. */
export const PAGE_SIZE = 100;

/**
 * The client with `clientId`, read from the pages of the client list (`fetchPage` asks the API for
 * page `number`), or `null` when the workspace has none with that ID. The profile route uses it
 * until `GET /v1/workspaces/{workspaceId}/clients/{clientId}` (F006's read and edit API) is in the
 * contract; then the profile page asks for the one client and this goes away. `pageSize` is the
 * size of the pages `fetchPage` returns.
 */
export async function findClient(
  clientId: string,
  fetchPage: (number: number) => Promise<{ items: Client[]; total: number }>,
  pageSize: number = PAGE_SIZE,
): Promise<Client | null> {
  for (let number = 1; ; number++) {
    const { items, total } = await fetchPage(number);
    const found = items.find(({ id }) => id === clientId);
    if (found) return found;
    if (number * pageSize >= total) return null;
  }
}
