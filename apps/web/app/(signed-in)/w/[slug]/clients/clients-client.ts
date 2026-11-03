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

/** What the client form (quick add and edit) holds: empty strings are fields left empty. */
export interface ClientFormInput {
  name: string;
  email: string;
  emailLocale: 'nl-NL' | 'en' | '';
}

/** The `clients.addDialog.errors.*` catalog keys that word a refused field. */
export type NameErrorKey = 'nameRequired' | 'nameTooLong';
export type EmailErrorKey = 'emailRequired' | 'emailInvalid';

/** The result of a save, an add or an edit: the same fields are refused in the same words. */
export type SaveClientResult =
  | { ok: true; client: Client }
  /** The API refused a field: the form shows the message under it and keeps the input. */
  | { ok: false; reason: 'fields'; name?: NameErrorKey; email?: EmailErrorKey }
  /** A client of the workspace already has the address: nothing was added. */
  | { ok: false; reason: 'exists'; clientId: string }
  /** Not signed in, or no longer allowed to add clients: the page asks again what this person may do. */
  | { ok: false; reason: 'home' }
  | { ok: false; reason: 'noConnection' | 'generic' };

/**
 * Adds a client (`POST /api/v1/workspaces/{workspaceId}/clients`, F006 AC1–AC3). The name and the
 * email address are both required (#174, decision 5): a blank one is refused here, with no
 * request, so the form shows its message at once. An empty language is left out of the request, so
 * the client follows the workspace's default. The rest is the API's call, and its validation codes
 * word the field errors (`too_small` an empty or blank name, `too_big` a long one, `invalid_type`
 * a missing address and any other issue on `email` an address that is none); its 409
 * `client_exists` names the client that has the address.
 */
export async function addClient(
  workspaceId: string,
  { name, email, emailLocale }: ClientFormInput,
  fetchFn: typeof fetch = fetch,
): Promise<SaveClientResult> {
  const blank = blankFields({ name, email });
  if (blank) return blank;
  const body: Schemas['AddClientRequest'] = { name, email: email.trim() };
  if (emailLocale) body.emailLocale = emailLocale;
  return await send(`/api/v1/workspaces/${workspaceId}/clients`, 'POST', body, 201, fetchFn);
}

/**
 * Saves the edit of a client (`PATCH /api/v1/workspaces/{workspaceId}/clients/{clientId}`, F006
 * AC7): the same fields, rules and messages as adding, and the same result. The email address can
 * never be cleared (#174, decision 6), so a blank one is refused here, with no request. It is
 * sent only when it is another address than the client has now: the team can't change the address
 * of a client who has joined, and a save that leaves it alone must not ask for that. The language
 * goes back to the workspace's default with `clearEmailLocale` (the generated clients of the apps
 * can't send `null`, and this one sends what they send).
 */
export async function updateClient(
  workspaceId: string,
  current: Client,
  { name, email, emailLocale }: ClientFormInput,
  fetchFn: typeof fetch = fetch,
): Promise<SaveClientResult> {
  const blank = blankFields({ name, email });
  if (blank) return blank;
  const body: Schemas['UpdateClientRequest'] = { name };
  if (email.trim().toLowerCase() !== current.email) body.email = email.trim();
  if (emailLocale) body.emailLocale = emailLocale;
  else if (current.emailLocale !== null) body.clearEmailLocale = true;
  return await send(
    `/api/v1/workspaces/${workspaceId}/clients/${current.id}`,
    'PATCH',
    body,
    200,
    fetchFn,
  );
}

/** The refusal of a blank name or email address, before any request; `null` when both are filled. */
function blankFields({ name, email }: { name: string; email: string }): SaveClientResult | null {
  const blank: SaveClientResult & { reason: 'fields' } = { ok: false, reason: 'fields' };
  if (!name.trim()) blank.name = 'nameRequired';
  if (!email.trim()) blank.email = 'emailRequired';
  return blank.name || blank.email ? blank : null;
}

/** Sends the add or the edit and words the answer: shared, because both forms are the same one. */
async function send(
  url: string,
  method: 'POST' | 'PATCH',
  body: Schemas['AddClientRequest'] | Schemas['UpdateClientRequest'],
  successStatus: 200 | 201,
  fetchFn: typeof fetch,
): Promise<SaveClientResult> {
  let response: Response;
  try {
    response = await fetchFn(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, reason: 'noConnection' };
  }
  if (response.status === successStatus) {
    const client = (await response.json().catch(() => null)) as Client | null;
    return client ? { ok: true, client } : { ok: false, reason: 'generic' };
  }
  if ([401, 403, 404].includes(response.status)) return { ok: false, reason: 'home' };
  const problem = (await response.json().catch(() => null)) as {
    code?: string;
    clientId?: string;
    issues?: { path?: unknown; code?: unknown }[];
  } | null;
  if (response.status === 409 && problem?.code === 'client_exists' && problem.clientId) {
    return { ok: false, reason: 'exists', clientId: problem.clientId };
  }
  if (response.status === 400) {
    const refused = refusedFields(problem);
    const failure: SaveClientResult & { reason: 'fields' } = { ok: false, reason: 'fields' };
    if (refused.name) failure.name = refused.name === 'tooLong' ? 'nameTooLong' : 'nameRequired';
    const refusedEmail = problem?.issues?.filter(({ path }) => path === 'email');
    if (refusedEmail?.length) {
      failure.email = refusedEmail.some(({ code }) => code === 'invalid_type')
        ? 'emailRequired'
        : 'emailInvalid';
    }
    if (failure.name || failure.email) return failure;
  }
  return { ok: false, reason: 'generic' };
}

/**
 * The client with `clientId` behind a refused address, for the line "Anna de Vries gebruikt dit
 * e-mailadres al." The 409 names only the ID, so the name is read with
 * `GET /api/v1/workspaces/{workspaceId}/clients/{clientId}`. `null` when it can't be read.
 */
export async function findExistingClient(
  workspaceId: string,
  clientId: string,
  fetchFn: typeof fetch = fetch,
): Promise<Client | null> {
  try {
    const response = await fetchFn(`/api/v1/workspaces/${workspaceId}/clients/${clientId}`);
    if (response.status !== 200) return null;
    return ((await response.json()) as Client | null) ?? null;
  } catch {
    return null;
  }
}
