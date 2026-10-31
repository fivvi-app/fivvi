import type { Schemas } from '@fivvi/contract';
import { refusedFields } from '../../../validation-issues';

export type Client = Schemas['Client'];

/** The biggest page the API gives; the list asks for it so most workspaces see everyone at once. */
export const PAGE_SIZE = 100;

export type SearchClientsResult =
  | { ok: true; items: Client[]; total: number }
  /** Not signed in, or no longer allowed to see clients: the page asks again what this person may do. */
  | { ok: false; reason: 'home' }
  | { ok: false; reason: 'noConnection' | 'generic' };

/**
 * One page of the workspace's clients, sorted by name by the API, narrowed by `search`
 * (`GET /api/v1/workspaces/{workspaceId}/clients?search=`, F006 AC6). The API matches part of a
 * name or an email address, ignoring case and accents; nothing is matched here.
 */
export async function searchClients(
  workspaceId: string,
  search: string,
  fetchFn: typeof fetch = fetch,
): Promise<SearchClientsResult> {
  const query = new URLSearchParams();
  if (search.trim()) query.set('search', search.trim());
  query.set('pageSize', String(PAGE_SIZE));
  let response: Response;
  try {
    response = await fetchFn(`/api/v1/workspaces/${workspaceId}/clients?${query}`);
  } catch {
    return { ok: false, reason: 'noConnection' };
  }
  if ([401, 403, 404].includes(response.status)) return { ok: false, reason: 'home' };
  if (response.status !== 200) return { ok: false, reason: 'generic' };
  const body = (await response.json().catch(() => null)) as Schemas['ClientList'] | null;
  if (!body || !Array.isArray(body.items)) return { ok: false, reason: 'generic' };
  return { ok: true, items: body.items, total: body.total };
}

/** What the quick-add form holds: empty strings are fields left empty. */
export interface AddClientInput {
  name: string;
  email: string;
  emailLocale: 'nl-NL' | 'en' | '';
}

/** The `clients.addDialog.errors.*` catalog keys that word a refused field. */
export type NameErrorKey = 'nameRequired' | 'nameTooLong';
export type EmailErrorKey = 'emailInvalid';

export type AddClientResult =
  | { ok: true; client: Client }
  /** The API refused a field: the form shows the message under it and keeps the input. */
  | { ok: false; reason: 'fields'; name?: NameErrorKey; email?: EmailErrorKey }
  /** A client of the workspace already has the address: nothing was added. */
  | { ok: false; reason: 'exists'; clientId: string }
  /** Not signed in, or no longer allowed to add clients: the page asks again what this person may do. */
  | { ok: false; reason: 'home' }
  | { ok: false; reason: 'noConnection' | 'generic' };

/**
 * Adds a client (`POST /api/v1/workspaces/{workspaceId}/clients`, F006 AC1–AC3). Only the name is
 * required; an empty address or language is left out of the request, so the client follows the
 * workspace's default. Like the other forms, it checks nothing before it asks: the API's
 * validation codes word the field errors (`too_small` an empty or blank name, `too_big` a long
 * one, and any issue on `email` an address that is none), and its 409 `client_exists` names the
 * client that has the address.
 */
export async function addClient(
  workspaceId: string,
  { name, email, emailLocale }: AddClientInput,
  fetchFn: typeof fetch = fetch,
): Promise<AddClientResult> {
  const body: Schemas['AddClientRequest'] = { name };
  if (email.trim()) body.email = email.trim();
  if (emailLocale) body.emailLocale = emailLocale;
  let response: Response;
  try {
    response = await fetchFn(`/api/v1/workspaces/${workspaceId}/clients`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, reason: 'noConnection' };
  }
  if (response.status === 201) {
    const client = (await response.json().catch(() => null)) as Client | null;
    return client ? { ok: true, client } : { ok: false, reason: 'generic' };
  }
  if ([401, 403, 404].includes(response.status)) return { ok: false, reason: 'home' };
  const problem = (await response.json().catch(() => null)) as {
    code?: string;
    clientId?: string;
    issues?: { path?: unknown }[];
  } | null;
  if (response.status === 409 && problem?.code === 'client_exists' && problem.clientId) {
    return { ok: false, reason: 'exists', clientId: problem.clientId };
  }
  if (response.status === 400) {
    const refused = refusedFields(problem);
    const failure: AddClientResult & { reason: 'fields' } = { ok: false, reason: 'fields' };
    if (refused.name) failure.name = refused.name === 'tooLong' ? 'nameTooLong' : 'nameRequired';
    if (problem?.issues?.some(({ path }) => path === 'email')) failure.email = 'emailInvalid';
    if (failure.name || failure.email) return failure;
  }
  return { ok: false, reason: 'generic' };
}

/**
 * The client with `clientId` behind a refused address, for the line "Anna de Vries gebruikt dit
 * e-mailadres al." The 409 names only the ID, so the name comes from the same search the list
 * uses, on the address that was typed. `null` when it can't be found.
 */
export async function findExistingClient(
  workspaceId: string,
  clientId: string,
  email: string,
  fetchFn: typeof fetch = fetch,
): Promise<Client | null> {
  const result = await searchClients(workspaceId, email, fetchFn);
  return result.ok ? (result.items.find(({ id }) => id === clientId) ?? null) : null;
}
