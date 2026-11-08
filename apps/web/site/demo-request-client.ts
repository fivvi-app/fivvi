import type { Schemas } from '@fivvi/contract';

/** What the form sends: the API's `DemoRequest`. */
export type DemoRequestInput = Schemas['DemoRequest'];

/** The `site.demo.errors.*` key that words a refused field. */
export type DemoFieldError = 'nameRequired' | 'nameTooLong' | 'emailInvalid' | 'messageTooLong';

export type DemoRequestResult =
  | { ok: true }
  /** The API refused fields: the page shows each message under its field; nothing was sent. */
  | {
      ok: false;
      reason: 'fields';
      errors: { name?: DemoFieldError; email?: DemoFieldError; message?: DemoFieldError };
    }
  /** Too many requests from this network. */
  | { ok: false; reason: 'rateLimited' }
  /** The request never reached the server. */
  | { ok: false; reason: 'noConnection' }
  /** The server could not send it (or answered something unexpected): the visitor may write to us. */
  | { ok: false; reason: 'failed' };

/** How the API's issue code on `field` is worded. `too_big` is a long value; the rest invalid. */
function refusal(field: 'name' | 'email' | 'message', code: unknown): DemoFieldError {
  if (field === 'email') return 'emailInvalid';
  if (field === 'message') return 'messageTooLong';
  return code === 'too_big' ? 'nameTooLong' : 'nameRequired';
}

/**
 * Sends a demo request (`POST /api/v1/demo-requests`, F064). Nothing is checked before the
 * request: the API's rules are the only ones, and its validation codes word the field errors. The
 * text fields are trimmed, so a space typed after an address by a phone's keyboard is no error.
 * The answer is never kept or logged here.
 */
export async function sendDemoRequest(
  input: DemoRequestInput,
  fetchFn: typeof fetch = fetch,
): Promise<DemoRequestResult> {
  let response: Response;
  try {
    response = await fetchFn('/api/v1/demo-requests', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...input,
        name: input.name.trim(),
        email: input.email.trim(),
        message: input.message?.trim(),
      }),
    });
  } catch {
    return { ok: false, reason: 'noConnection' };
  }
  if (response.status === 202) return { ok: true };
  if (response.status === 429) return { ok: false, reason: 'rateLimited' };
  if (response.status === 400) {
    const body: unknown = await response.json().catch(() => null);
    const issues = (body as { issues?: { path?: unknown; code?: unknown }[] } | null)?.issues;
    const errors: Extract<DemoRequestResult, { reason: 'fields' }>['errors'] = {};
    for (const { path, code } of Array.isArray(issues) ? issues : []) {
      if (path === 'name' || path === 'email' || path === 'message')
        errors[path] = refusal(path, code);
    }
    if (Object.keys(errors).length > 0) return { ok: false, reason: 'fields', errors };
  }
  return { ok: false, reason: 'failed' };
}
