import type { Schemas } from '@fivvi/contract';

/** The `welcome.errors.*` catalog key that words a refused field. */
export type FieldErrorKey =
  | 'personNameRequired'
  | 'personNameTooLong'
  | 'workspaceNameRequired'
  | 'workspaceNameTooLong';

export interface Fields {
  personName?: FieldErrorKey;
  name?: FieldErrorKey;
}

export type CreateWorkspaceResult =
  | { ok: true; slug: string }
  /** The API refused a field: the page shows the message under it, and nothing was created. */
  | { ok: false; reason: 'fields'; fields: Fields }
  /** Not signed in, or not (or no longer) allowed to set one up: the signed-in home decides. */
  | { ok: false; reason: 'home' }
  | { ok: false; reason: 'noConnection' | 'generic' };

const WORKSPACES_URL = '/api/v1/workspaces';

/**
 * Creates the workspace (`POST /api/v1/workspaces`, AC1). The page words every failure itself
 * from the API's validation codes (`too_small` is an empty or blank value, `too_big` a long one):
 * the API's rules are the only ones, the page checks nothing before it asks. `personName` is left
 * out when the account already has a name.
 */
export async function createWorkspace(
  input: { name: string; personName?: string },
  fetchFn: typeof fetch = fetch,
): Promise<CreateWorkspaceResult> {
  let response: Response;
  try {
    response = await fetchFn(WORKSPACES_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
  } catch {
    return { ok: false, reason: 'noConnection' };
  }
  const body: unknown = await response.json().catch(() => null);
  if (response.status === 201) {
    const slug = (body as Partial<Schemas['Workspace']> | null)?.slug;
    return typeof slug === 'string' ? { ok: true, slug } : { ok: false, reason: 'generic' };
  }
  if (response.status === 401 || response.status === 403) return { ok: false, reason: 'home' };
  if (response.status === 400) {
    const fields = fieldsOf(body);
    if (fields) return { ok: false, reason: 'fields', fields };
  }
  return { ok: false, reason: 'generic' };
}

/** The refused fields of a `validation_failed` answer; `undefined` when it names none the page has. */
function fieldsOf(body: unknown): Fields | undefined {
  const issues = (body as { issues?: { path?: unknown; code?: unknown }[] } | null)?.issues;
  if (!Array.isArray(issues)) return undefined;
  const fields: Fields = {};
  for (const { path, code } of issues) {
    const tooLong = code === 'too_big';
    if (path === 'name') fields.name = tooLong ? 'workspaceNameTooLong' : 'workspaceNameRequired';
    if (path === 'personName')
      fields.personName = tooLong ? 'personNameTooLong' : 'personNameRequired';
  }
  return fields.name || fields.personName ? fields : undefined;
}
